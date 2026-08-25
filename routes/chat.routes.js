const express = require("express");
const router = express.Router();
const { handleChat, clearSessionChat } = require("../controller/chatController");

/**
 * Node.js Chat Routing Module
 * ---------------------------
 * Maps endpoints for conversational interactions and query planning.
 */

// Main analytics chat endpoint
router.post("/", handleChat);

// Endpoint to clear the history logs of the active user session
router.post("/clear", clearSessionChat);

module.exports = router;
