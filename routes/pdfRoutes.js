const express = require("express");
const router = express.Router();
const { uploadFileHandler } = require("../controller/pdfController");
const { upload } = require("../middleware/upload");

/**
 * Express File Upload Routes
 * --------------------------
 * Educational Overview:
 * Routes map HTTP endpoints (URL + HTTP method) to controller middleware functions.
 * `upload.single(...)` handles file upload parsing for single file fields.
 */

// Middleware wrapper to catch Multer file upload errors and format as JSON
const handleMulterUpload = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      console.error("[UploadMiddleware] File upload error:", err.message);
      return res.status(400).json({
        success: false,
        error: err.message || "File upload failed due to file size or format constraints.",
      });
    }
    next();
  });
};

// Unified endpoint for PDF, Excel, and CSV files
router.post("/upload-file", handleMulterUpload, uploadFileHandler);

// Legacy backward-compatible endpoint
router.post("/upload-pdf", handleMulterUpload, uploadFileHandler);

module.exports = router;
