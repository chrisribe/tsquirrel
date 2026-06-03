/**
 * GalleryDAO - Simplified data access for galleries and photos
 */
class GalleryDAO {
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================
  // GALLERY METHODS
  // ============================================

  async createGallery(userId, title) {
    const result = await this.pool.query(
      'INSERT INTO galleries (user_id, title) VALUES ($1, $2) RETURNING *',
      [userId, title]
    );
    return result.rows[0];
  }

  async getGalleryByUuid(uuid) {
    const result = await this.pool.query(
      'SELECT * FROM galleries WHERE uuid = $1',
      [uuid]
    );
    return result.rows[0];
  }

  async getUserGalleryCount(userId) {
    const result = await this.pool.query(
      'SELECT COUNT(*) as count FROM galleries WHERE user_id = $1',
      [userId]
    );
    return parseInt(result.rows[0].count);
  }

  async getUserGalleries(userId) {
    const result = await this.pool.query(
      `SELECT g.*, 
              COUNT(p.id) as photo_count,
              cover.s3_key as cover_photo_key,
              cover.photo_id as cover_photo_id
       FROM galleries g 
       LEFT JOIN photos p ON g.uuid = p.gallery_uuid 
       LEFT JOIN LATERAL (
         SELECT s3_key, photo_id 
         FROM photos 
         WHERE gallery_uuid = g.uuid 
         ORDER BY uploaded_at 
         LIMIT 1
       ) cover ON true
       WHERE g.user_id = $1 
       GROUP BY g.id, cover.s3_key, cover.photo_id
       ORDER BY g.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async deleteGallery(userId, galleryId) {
    const result = await this.pool.query(
      'DELETE FROM galleries WHERE id = $1 AND user_id = $2 RETURNING *',
      [galleryId, userId]
    );
    return result.rows[0];
  }

  async updateGalleryQRCode(galleryUuid, qrCodeUrl) {
    const result = await this.pool.query(
      'UPDATE galleries SET qr_code_url = $1 WHERE uuid = $2 RETURNING *',
      [qrCodeUrl, galleryUuid]
    );
    return result.rows[0];
  }

  async updateGalleryTitle(galleryUuid, userId, title) {
    const result = await this.pool.query(
      'UPDATE galleries SET title = $1 WHERE uuid = $2 AND user_id = $3 RETURNING *',
      [title, galleryUuid, userId]
    );
    return result.rows[0];
  }

  // ============================================
  // PHOTO METHODS
  // ============================================

  async addPhoto(galleryUuid, photoId, s3Key, width, height, fileHash = null, takenAt = null) {
    const result = await this.pool.query(
      `INSERT INTO photos (gallery_uuid, photo_id, s3_key, width, height, file_hash, taken_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [galleryUuid, photoId, s3Key, width, height, fileHash, takenAt]
    );
    return result.rows[0];
  }

  async hashExists(galleryUuid, fileHash) {
    const result = await this.pool.query(
      'SELECT 1 FROM photos WHERE gallery_uuid = $1 AND file_hash = $2 LIMIT 1',
      [galleryUuid, fileHash]
    );
    return result.rows.length > 0;
  }

  async checkHashes(galleryUuid, hashes) {
    if (!hashes || hashes.length === 0) return [];
    
    const result = await this.pool.query(
      'SELECT file_hash FROM photos WHERE gallery_uuid = $1 AND file_hash = ANY($2)',
      [galleryUuid, hashes]
    );
    return result.rows.map(r => r.file_hash);
  }

  async getPhotos(galleryUuid) {
    const result = await this.pool.query(
      `SELECT photo_id, s3_key, width, height, uploaded_at, taken_at 
       FROM photos 
       WHERE gallery_uuid = $1 
       ORDER BY COALESCE(taken_at, uploaded_at) DESC`,
      [galleryUuid]
    );
    return result.rows;
  }

  async getPhotoById(photoId) {
    const result = await this.pool.query(
      'SELECT photo_id, s3_key, gallery_uuid FROM photos WHERE photo_id = $1',
      [photoId]
    );
    return result.rows[0];
  }

  async getPhotoCount(galleryUuid) {
    const result = await this.pool.query(
      'SELECT COUNT(*) as count FROM photos WHERE gallery_uuid = $1',
      [galleryUuid]
    );
    return parseInt(result.rows[0].count);
  }

  async deletePhoto(galleryUuid, photoId) {
    const result = await this.pool.query(
      'DELETE FROM photos WHERE gallery_uuid = $1 AND photo_id = $2 RETURNING *',
      [galleryUuid, photoId]
    );
    return result.rows[0];
  }

}

module.exports = GalleryDAO;
