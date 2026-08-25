const express = require("express");
const router = express.Router();
const { upload } = require("../middleware/upload");
const { uploadDataset, getActiveDatasetProfile, selectDataset, exportDataset } = require("../controller/datasetController");

/**
 * Node.js Dataset API Routes
 * --------------------------
 * LEARN THE TECHNOLOGY:
 * 1. Express Routers: Allows splitting endpoints into separate modules to keep the entry file `index.js` small.
 * 2. File Upload Middleware: `upload.single("file")` intercepts incoming multipart HTTP forms,
 *    processes the file stream, uploads it, and appends the details (path, original name) to `req.file`
 *    before passing execution to our controller.
 */

// Route to handle CSV, Excel, or PDF document uploads
router.post("/upload", upload.single("file"), uploadDataset);

// Route to get the structural data quality profile of the active dataset
router.get("/profile", getActiveDatasetProfile);

// Route to manually select / switch the active session dataset
router.post("/select", selectDataset);

// Route to trigger streaming downloads of the processed data (returns Excel or CSV)
router.get("/export", exportDataset);

module.exports = router;
