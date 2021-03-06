import Post from './server/models/post.model';

import config from './config/config';
import steemApi from './server/steemAPI';

const mongoose = require('mongoose');
mongoose.Promise = require('bluebird');

mongoose.connect(`${config.mongo.host}`);

const conn = mongoose.connection;
conn.once('open', function ()
{
  // updating only posts created in last 15 days
  const activeSince = new Date((new Date().getTime() - (15 * 24 * 60 * 60 * 1000)));
  const query = {
    created:
      {
        $gte: activeSince.toISOString()
      }
  };

  Post
    .countAll({ query })
    .then(count => {
      if (count === 0) {
        console.log(`NO POSTS TO UPDATE. ENDED.`);
        process.exit(0);
      } else {
        console.log(`${count} ACTIVE POSTS. CHECKING AND UPDATING`);
      }

      Post
        .list({ skip: 0, limit: count, query })
        .then(posts => {
          if(posts.length > 0) {
            posts.forEach((post, index) => {
              steemApi.getContent(post.author, post.permlink, (err, updatedPost) => {
                if (!err) {
                  console.log(`---- NOW CHECKING POST ${post.permlink} by ${post.author} ----\n`);

                  updatedPost.json_metadata = JSON.parse(updatedPost.json_metadata);

                  // @UTOPIAN @TODO bad patches. Needs to have a specific place where the put the utopian data so it does not get overwritten
                  if (!updatedPost.json_metadata.type && post.json_metadata.type) {
                    updatedPost.json_metadata.type = post.json_metadata.type;
                  }
                  if (updatedPost.json_metadata.app !== 'utopian/1.0.0') updatedPost.json_metadata.app = 'utopian/1.0.0';
                  if (updatedPost.json_metadata.community !== 'utopian') updatedPost.json_metadata.community = 'utopian';
                  // making sure the repository does not get deleted
                  if (!updatedPost.json_metadata.repository) updatedPost.json_metadata.repository = post.json_metadata.repository;
                  if (!updatedPost.json_metadata.platform) updatedPost.json_metadata.platform = post.json_metadata.platform;
                  if (!updatedPost.json_metadata.pullRequests && post.json_metadata.pullRequests) updatedPost.json_metadata.pullRequests = post.json_metadata.pullRequests;

                  for (var prop in updatedPost) {
                    if (updatedPost[prop] !== post[prop]) {
                      post[prop] = updatedPost[prop];
                      console.log(`UPDATED PROP ${prop} was ${JSON.stringify(post[prop])} now is ${JSON.stringify(updatedPost[prop])}\n`);
                    }
                  }

                  post.save()
                    .then(() => console.log(`POST UPDATED SUCCESSFULLY\n`))
                    .catch(e => {
                      console.log(`ERROR UPDATING POST ${e}\n`);
                      next(e);
                    })
                    .finally(() => {
                      if ((index + 1) === count) {
                        conn.close();
                        process.exit(0);
                      }
                    })
                } else {
                  console.log(`CANNOT RETRIEVE POST - STEEM ERROR ${err}\n`);
                  if ((index + 1) === count) {
                    conn.close();
                    process.exit(0);
                  }
                }

              });
            });
          }
        })
        .catch(e => console.log(`CANNOT RETRIEVE POSTS FROM MONGO ${e}\n`));
    })
    .catch(e => console.log(`CANNOT COUNT ACTIVE POSTS IN MONGO ${e}\n`));
});
