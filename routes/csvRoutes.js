const express = require("express");
const router = express.Router();
const { previewCsv, downloadCsv, downloadUpdated } = require("../controller/csvController");

router.get("/preview-csv", previewCsv);
router.get("/download-csv", downloadCsv);
router.get("/download-updated", downloadUpdated);

module.exports = router;
