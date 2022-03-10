require('dotenv').config()
const log = require('simple-node-logger').createSimpleLogger('logs/pfp.log');
const fs = require('fs');
const path = require('path');
const S3 = require('aws-sdk/clients/s3');
const Twit = require('twit');
const sharp = require('sharp');
const TMP_DIR = '/tmp';


function cleanTmpDir() {
  fs.readdir(TMP_DIR, (err, files) => {
    if (err) log.error(`Could not glear /tmp: ${err}`);
    for (const file of files) {
      fs.unlink(path.join(TMP_DIR, file), err => {
        if (err) log.error(`Could not delete file: ${err}`);
      });
    }
  })
}


function lambda_handler(event, context) {
  log.info('<--BEGIN-->');
  let client = new Twit({
    consumer_key: process.env.TWITTER_KEY,
    consumer_secret: process.env.TWITTER_SECRET,
    access_token:process.env.TWITTER_TOKEN,
    access_token_secret: process.env.TWITTER_TOKEN_SECRET,
  });

  var svgName = 'template_pfp.svg'
  var svgPath = path.join(TMP_DIR, 'template_pfp.svg');
  var name = svgName.replace('.svg', '');
  var pngPath = path.join(TMP_DIR, name + '.png');
  sharp(svgPath).png().toFile(pngPath).then( _ => {
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
                cleanTmpDir()
              } else {
                log.error(`Could not perform statuses/update: ${err}`);
              }
            });
          } else {
            log.error(`Could not perform media/metadata/create: ${err}`);
            cleanTmpDir()
          }
        });
      } else {
        log.error(`Could not post media chunk: ${err}`);
        cleanTmpDir()
      }
    });
  });
}

lambda_handler()