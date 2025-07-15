const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const sharp = require("sharp");

const s3 = new S3Client();
const BUCKET = process.env.BUCKET_NAME || "eventglimpse";

const SIZES = {
  thumb: { width: 200, prefix: "thumbs/" },
  display: { width: 800, prefix: "display/" },
  original: { prefix: "originals/" }
};

exports.handler = async (event) => {
  console.log('EventGlimpse Image Processor started');
  
  for (const record of event.Records) {
    const srcKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    
    // Only process uploads folder
    if (!srcKey.startsWith("uploads/")) {
      console.log(`Skipping non-upload file: ${srcKey}`);
      continue;
    }
    
    const keyParts = srcKey.split('/');
    if (keyParts.length !== 3) {
      console.log(`Invalid key format: ${srcKey}`);
      continue;
    }
    
    const [, eventUuid, filename] = keyParts;
    console.log(`Processing: ${eventUuid}/${filename}`);
    
    try {
      // Get image from S3
      const { Body, ContentType } = await s3.send(new GetObjectCommand({ 
        Bucket: BUCKET, 
        Key: srcKey 
      }));
      
      const image = await Body.transformToByteArray();
      console.log(`Downloaded ${filename}, size: ${image.length} bytes`);
      
      // Process each size
      for (const [sizeName, config] of Object.entries(SIZES)) {
        const destKey = `${config.prefix}${eventUuid}/${filename}`;
        
        let processedImage;
        if (sizeName === 'original') {
          processedImage = Buffer.from(image);
        } else {
          processedImage = await sharp(image)
            .resize(config.width)
            .jpeg({ quality: 85, mozjpeg: true })
            .toBuffer();
        }
        
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: destKey,
          Body: processedImage,
          ContentType: ContentType || 'image/jpeg',
          CacheControl: 'max-age=31536000'
        }));
        
        console.log(`Created ${sizeName}: ${destKey}`);
      }
      
      // Delete original upload
      await s3.send(new DeleteObjectCommand({ 
        Bucket: BUCKET, 
        Key: srcKey 
      }));
      
      console.log(`✅ Completed processing ${filename}`);
      
    } catch (error) {
      console.error(`❌ Error processing ${srcKey}:`, error);
      throw error;
    }
  }
  
  return { statusCode: 200, body: 'Processing complete' };
};
