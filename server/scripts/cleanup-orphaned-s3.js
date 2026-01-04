#!/usr/bin/env node
/**
 * Cleanup Orphaned S3 Files
 * 
 * Finds and deletes S3 files that no longer have corresponding database records.
 * Run manually or via cron: node scripts/cleanup-orphaned-s3.js
 * 
 * Options:
 *   --dry-run    List orphaned files without deleting (default)
 *   --delete     Actually delete the orphaned files
 * 
 * Usage:
 *   node scripts/cleanup-orphaned-s3.js --dry-run
 *   node scripts/cleanup-orphaned-s3.js --delete
 */

const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');

const DRY_RUN = !process.argv.includes('--delete');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'eventglimpse';

async function main() {
  console.log(`\n🧹 S3 Cleanup Script (${DRY_RUN ? 'DRY RUN' : '⚠️  DELETE MODE'})\n`);
  
  // Connect to database
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    // Get all gallery UUIDs from database
    const { rows: galleries } = await pool.query('SELECT uuid FROM galleries');
    const validGalleryUuids = new Set(galleries.map(g => g.uuid));
    console.log(`📁 Found ${validGalleryUuids.size} galleries in database`);
    
    // Get all photo IDs from database (grouped by gallery)
    const { rows: photos } = await pool.query('SELECT gallery_uuid, photo_id FROM photos');
    const validPhotos = new Map();
    photos.forEach(p => {
      if (!validPhotos.has(p.gallery_uuid)) {
        validPhotos.set(p.gallery_uuid, new Set());
      }
      validPhotos.get(p.gallery_uuid).add(p.photo_id);
    });
    console.log(`📸 Found ${photos.length} photos in database\n`);
    
    const orphanedKeys = [];
    const folders = ['uploads', 'thumbs', 'display', 'originals', 'qr-codes'];
    
    for (const folder of folders) {
      console.log(`Scanning ${folder}/...`);
      
      let continuationToken;
      do {
        const response = await s3.send(new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: `${folder}/`,
          ContinuationToken: continuationToken
        }));
        
        for (const obj of response.Contents || []) {
          const key = obj.Key;
          const parts = key.split('/');
          
          if (folder === 'qr-codes') {
            // qr-codes/[uuid].png
            const uuid = parts[1]?.replace('.png', '');
            if (uuid && !validGalleryUuids.has(uuid)) {
              orphanedKeys.push(key);
            }
          } else {
            // [folder]/[uuid]/[photoId].[ext]
            const uuid = parts[1];
            const photoIdWithExt = parts[2];
            const photoId = photoIdWithExt?.substring(0, photoIdWithExt.lastIndexOf('.'));
            
            if (!uuid || !validGalleryUuids.has(uuid)) {
              // Gallery doesn't exist
              orphanedKeys.push(key);
            } else if (photoId && validPhotos.has(uuid) && !validPhotos.get(uuid).has(photoId)) {
              // Gallery exists but photo doesn't
              orphanedKeys.push(key);
            } else if (photoId && !validPhotos.has(uuid)) {
              // Gallery exists but has no photos
              orphanedKeys.push(key);
            }
          }
        }
        
        continuationToken = response.NextContinuationToken;
      } while (continuationToken);
    }
    
    console.log(`\n🔍 Found ${orphanedKeys.length} orphaned files\n`);
    
    if (orphanedKeys.length === 0) {
      console.log('✅ No cleanup needed!');
      return;
    }
    
    // Show orphaned files
    if (orphanedKeys.length <= 50) {
      orphanedKeys.forEach(key => console.log(`  - ${key}`));
    } else {
      orphanedKeys.slice(0, 20).forEach(key => console.log(`  - ${key}`));
      console.log(`  ... and ${orphanedKeys.length - 20} more`);
    }
    
    if (DRY_RUN) {
      console.log(`\n⚠️  DRY RUN - No files deleted`);
      console.log(`   Run with --delete to remove these files`);
    } else {
      // Delete in batches of 1000 (S3 limit)
      console.log(`\n🗑️  Deleting ${orphanedKeys.length} files...`);
      
      for (let i = 0; i < orphanedKeys.length; i += 1000) {
        const batch = orphanedKeys.slice(i, i + 1000);
        await s3.send(new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: batch.map(key => ({ Key: key }))
          }
        }));
        console.log(`   Deleted batch ${Math.floor(i / 1000) + 1}/${Math.ceil(orphanedKeys.length / 1000)}`);
      }
      
      console.log(`\n✅ Deleted ${orphanedKeys.length} orphaned files`);
    }
    
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
