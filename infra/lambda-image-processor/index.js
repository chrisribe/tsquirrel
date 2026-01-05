/**
 * EventGlimpse Image Processor Lambda Function
 * 
 * Purpose: Automatically processes uploaded images from EventGlimpse app
 * Trigger: S3 ObjectCreated events on uploads/ folder
 * Runtime: Node.js 20.x with Sharp layer for image processing
 * 
 * Workflow:
 * 1. User uploads photo via EventGlimpse → lands in uploads/event-uuid/photo.jpg
 * 2. S3 triggers this Lambda function
 * 3. Lambda downloads original image
 * 4. Creates 3 optimized versions in public folders with auto-rotation:
 *    - thumbs/: 200px wide thumbnails (respects EXIF orientation)
 *    - display/: 1600px wide gallery images (respects EXIF orientation)
 *    - originals/: full-size optimized copies (respects EXIF orientation)
 * 5. Deletes the private upload to save storage
 * 
 * Features:
 * - Automatic EXIF orientation correction for mobile photos
 * - High-quality JPEG compression using mozjpeg encoder
 * - Responsive image sizes for different display contexts
 * 
 * Dependencies:
 * - AWS SDK v3 for S3 operations
 * - Sharp library from Lambda layer for image processing
 */

const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const sharp = require("sharp"); // From Lambda layer - Linux-compiled binaries

// Initialize S3 client with default credentials from Lambda execution role
const s3 = new S3Client();
const BUCKET = process.env.BUCKET_NAME || "eventglimpse"; // Fallback for local testing

/**
 * Image processing configuration
 * Each size creates a different version optimized for different use cases:
 * - thumb: Small thumbnails for grid views
 * - display: Medium size for gallery display
 * - original: Full-size but optimized (same dimensions, better compression)
 */
const SIZES = {
  thumb: { width: 200, prefix: "thumbs/" },     // Grid thumbnails
  display: { width: 1600, prefix: "display/" }, // Gallery display images (1600px for modern screens)
  original: { prefix: "originals/" }            // Full-size optimized copies
};

/**
 * Main Lambda handler function
 * 
 * @param {Object} event - S3 event containing records of uploaded files
 * @returns {Object} - Status response for Lambda execution
 * 
 * Event structure from S3 trigger:
 * {
 *   Records: [
 *     {
 *       s3: {
 *         object: { key: "uploads/event-uuid/photo-id.jpg" },
 *         bucket: { name: "eventglimpse" }
 *       }
 *     }
 *   ]
 * }
 */
exports.handler = async (event) => {
  console.log('EventGlimpse Image Processor started');
  
  // Process each file in the S3 event (usually just one, but could be multiple)
  for (const record of event.Records) {
    // Decode S3 key (handles special characters and spaces in filenames)
    const srcKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    
    // Security check: Only process files from uploads/ folder
    // This prevents infinite loops and ensures we only process user uploads
    if (!srcKey.startsWith("uploads/")) {
      console.log(`Skipping non-upload file: ${srcKey}`);
      continue;
    }
    
    // Parse S3 key structure: uploads/event-uuid/photo-filename.ext
    const keyParts = srcKey.split('/');
    if (keyParts.length !== 3) {
      console.log(`Invalid key format: ${srcKey}`);
      continue;
    }
    
    const [, eventUuid, filename] = keyParts; // Destructure: folder, eventId, filename
    console.log(`Processing: ${eventUuid}/${filename}`);
    
    try {
      // Step 1: Download the original image from S3
      const { Body, ContentType } = await s3.send(new GetObjectCommand({ 
        Bucket: BUCKET, 
        Key: srcKey 
      }));
      
      // Convert S3 stream to buffer for Sharp processing
      const image = await Body.transformToByteArray();
      console.log(`Downloaded ${filename}, size: ${image.length} bytes`);
      
      // Step 2: Create optimized versions for each configured size
      for (const [sizeName, config] of Object.entries(SIZES)) {
        // Build destination path: thumbs/event-uuid/photo.jpg
        const destKey = `${config.prefix}${eventUuid}/${filename}`;
        
        let processedImage;
        if (sizeName === 'original') {
          // For originals, apply auto-rotation and light compression while maintaining dimensions
          processedImage = await sharp(image)
            .rotate()                       // Auto-rotate based on EXIF orientation data
            .jpeg({ quality: 90, mozjpeg: true }) // Light compression for originals
            .toBuffer();
        } else {
          // Resize and optimize for thumbnails/display images
          processedImage = await sharp(image)
            .rotate()                       // Auto-rotate based on EXIF orientation data
            .resize(config.width)           // Resize to target width (maintains aspect ratio)
            .jpeg({ quality: 85, mozjpeg: true }) // High quality JPEG with mozjpeg encoder
            .toBuffer();
        }
        
        // Step 3: Upload processed image to public folder
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: destKey,
          Body: processedImage,
          ContentType: ContentType || 'image/jpeg',
          CacheControl: 'max-age=31536000' // Cache for 1 year (images don't change)
        }));
        
        console.log(`Created ${sizeName}: ${destKey}`);
      }
      
      // Step 4: Clean up - delete the original upload to save storage costs
      // The uploads/ folder is private anyway, so users access the processed versions
      await s3.send(new DeleteObjectCommand({ 
        Bucket: BUCKET, 
        Key: srcKey 
      }));
      
      console.log(`✅ Completed processing ${filename}`);
      
    } catch (error) {
      console.error(`❌ Error processing ${srcKey}:`, error);
      // Re-throw to mark Lambda execution as failed
      // This will trigger retries and help with debugging
      throw error;
    }
  }
  
  // Return success response
  return { statusCode: 200, body: 'Processing complete' };
};
