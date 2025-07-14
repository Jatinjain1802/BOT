const express = require("express");
const router = express.Router();
const { uploadPdfHandler } = require("../controller/pdfController");
const { upload } = require("../middleware/upload");

router.post("/upload-pdf", upload.single("pdf"), uploadPdfHandler);

module.exports = router;
