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

// Unified endpoint for PDF, Excel, and CSV files (accepting any field name: 'file', 'pdf', etc.)
router.post("/upload-file", upload.any(), uploadFileHandler);

// Legacy backward-compatible endpoint for existing clients
router.post("/upload-pdf", upload.any(), uploadFileHandler);

module.exports = router;
