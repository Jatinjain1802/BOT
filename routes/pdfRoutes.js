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

// Unified endpoint for PDF, Excel, and CSV files (accepting field name 'file' or 'pdf')
router.post("/upload-file", upload.single("file"), uploadFileHandler);

// Legacy backward-compatible endpoint for existing PDF clients
router.post("/upload-pdf", upload.single("pdf"), uploadFileHandler);

module.exports = router;
