const express = require("express");
const router = express.Router();
const { handleChat } = require("../controller/chatController");

router.post("/chat", handleChat);

module.exports = router;
