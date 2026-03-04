const fs = require('fs').promises;
const path = require('path');

/**
 * Abstract Storage Service
 * Currently uses Local Filesystem, but designed for S3/GCS plug-and-play.
 */
class StorageService {
    constructor() {
        this.baseDir = path.join(__dirname, '../uploads');
    }

    /**
     * @desc Get a publicly accessible URL for a stored file
     */
    getPublicUrl(filePath) {
        if (!filePath) return null;
        // In local mode, we return the relative path (served via express.static)
        // In Cloud mode, this would return a signed URL or CDN link
        return `/uploads/${path.basename(filePath)}`;
    }

    /**
     * @desc Delete a file from storage
     */
    async deleteFile(filePath) {
        if (!filePath) return;
        try {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.baseDir, path.basename(filePath));
            await fs.unlink(fullPath);
            console.log(`[STORAGE] Deleted: ${fullPath}`);
        } catch (error) {
            console.error(`[STORAGE ERROR] Failed to delete ${filePath}:`, error.message);
        }
    }

    /**
     * @desc Move a temporary upload to permanent storage
     */
    async persistFile(tempPath, fileName) {
        // For local, 'multer' already saves it. 
        // In S3 mode, this would upload the buffer/stream to a bucket.
        return tempPath;
    }
}

module.exports = new StorageService();
