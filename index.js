require('dotenv').config()
const log = require('simple-node-logger').createSimpleLogger();
const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const Twit = require('twit');
const sharp = require('sharp');
const TMP_DIR = '/tmp/';


function cleanTmpDir() {
  fs.readdir(TMP_DIR, (err, files) => {
    if (err) log.error(`Could not glear /tmp: ${err}`);
    for (const file of files) {
      fs.unlink(path.join(TMP_DIR, file), err => {
        if (err) log.error(`Could not delete file: ${err}`);
      });
    }
  });
}


exports.handler = async function (event, context, callback) {
  return new Promise(async (resolve, reject) => {
    log.info('<--BEGIN-->');
    let client = new Twit({
      consumer_key: process.env.TWITTER_KEY,
      consumer_secret: process.env.TWITTER_SECRET,
      access_token:process.env.TWITTER_TOKEN,
      access_token_secret: process.env.TWITTER_TOKEN_SECRET,
    });
    log.info('Initialized Twitter client');
    let s3 = new AWS.S3({
      region: process.env.S3_REIGON,
      accessKeyId: process.env.S3_ACCESS,
      secretAccessKey: process.env.S3_SECRET
    });
    log.info("initialized S3 client");

    // Get file name and bucket name.
    const srcBucket = event.Records[0].s3.bucket.name;
    const srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    log.info(`Recieved ${srcKey} from ${srcBucket}`);

    // Download image.
    try {
      const params = {
        Bucket: srcBucket,
        Key: srcKey,
      };
      var origimage = await s3.getObject(params).promise();
    } catch (err) {
      log.error(`Could not fetch image: ${err}`);
      reject(err)
    }

    var name = srcKey.replace('.svg', '');  // Get file name.
    var pngPath = path.join(TMP_DIR, name + '.png');  // Path to save converted SVG.
    sharp(origimage.Body).png().toFile(pngPath).then( _ => {
      client.postMediaChunked({ file_path: pngPath }, (err, data, _) => {
        if (!err) {
          var mediaStr = data.media_id_string;
          var altText = name;
          var meta_params = { media_id: mediaStr, alt_text: { text: altText }};
          client.post('media/metadata/create', meta_params, (err, _, __) => {
            if(!err) {
              var params = { status: name, media_ids: [mediaStr] };
              client.post('statuses/update', params, (err, _, __) =>{
                if (!err) {
                  log.info(`Successfully uploaded ${name}`);
                  cleanTmpDir();
                  resolve()
                } else {
                  log.error(`Could not perform statuses/update: ${err}`);
                  cleanTmpDir()
                  reject(err);
                }
              });
            } else {
              log.error(`Could not perform media/metadata/create: ${err}`);
              cleanTmpDir();
              reject(err);
            }
          });
        } else {
          log.error(`Could not post media chunk: ${err}`);
          cleanTmpDir();
          reject(er);
        }
      });
    });
  });
}
