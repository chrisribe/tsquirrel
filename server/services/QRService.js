const QRCode = require('qrcode');
const { uploadQRCodeToS3 } = require('./s3Service');

/**
 * QR Code generation service
 */
class QRService {
  /**
   * Generate and upload QR code for a gallery
   * @param {Object} gallery - Gallery object with uuid
   * @param {string} baseUrl - Base URL for the gallery link
   * @param {Object} galleryDAO - DAO to update gallery record
   * @returns {string|null} - QR code URL or null if failed
   */
  static async generateForGallery(gallery, baseUrl, galleryDAO) {
    if (gallery.qr_code_url) {
      return gallery.qr_code_url;
    }

    try {
      const galleryUrl = `${baseUrl}/g/${gallery.uuid}`;
      
      const qrCodeBuffer = await QRCode.toBuffer(galleryUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        type: 'png'
      });
      
      const qrCodeUrl = await uploadQRCodeToS3(gallery.uuid, qrCodeBuffer);
      await galleryDAO.updateGalleryQRCode(gallery.uuid, qrCodeUrl);
      
      return qrCodeUrl;
    } catch (error) {
      console.error('QR code generation error:', error);
      return null;
    }
  }
}

module.exports = QRService;
