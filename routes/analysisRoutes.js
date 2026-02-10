const express = require("express");
const router = express.Router();
const { analyzeDataHandler } = require("../controller/analysisController");

router.get("/analyze", analyzeDataHandler);

module.exports = router;
