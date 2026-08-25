const express = require("express");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const cors = require("cors");

/**
 * Main Express Application Entry Point
 * ------------------------------------
 * LEARN THE TECHNOLOGY:
 * 1. Express Middleware: Functions that execute sequentially during an HTTP request lifecycle.
 *    - `express.json` parses incoming requests with JSON payloads.
 *    - `express.urlencoded` parses incoming URL-encoded form submissions.
 *    - `express.static` serves static files (HTML, CSS, JS, images) from a folder.
 * 2. Static Asset Fallback: When static files are served, if a user accesses `http://localhost:3000/`,
 *    Express automatically searches for and returns `public/index.html`.
 * 3. Server Timeout: Heavy file processing operations (like chunking a 37MB+ spreadsheet) can take
 *    more than the default 2-minute Node timeout. Extending `server.timeout` prevents premature connection resets.
 */

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Global Middlewares ───
// Set request size limit to 100MB to allow large CSV/Excel payloads
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(cors());

// Serve static frontend files from /public directory
app.use(express.static(path.join(__dirname, "public")));

// ─── Register Refactored Modular API Routes ───
app.use("/api/datasets", require("./routes/dataset.routes"));
app.use("/api/chat", require("./routes/chat.routes"));

// ─── Backward Compatibility Legacy Endpoints ───
// Maps old prototype endpoints directly to the new refactored controller logic
const { upload } = require("./middleware/upload");
const { uploadDataset, exportDataset } = require("./controller/datasetController");
const { handleChat, clearSessionChat } = require("./controller/chatController");

// Upload redirects
app.post("/upload-file", upload.single("file"), uploadDataset);
app.post("/upload-pdf", upload.single("pdf"), uploadDataset); // Legacy PDFs came under 'pdf' field name

// Chat and session reset redirects
app.post("/chat", handleChat);
app.post("/clear-session", clearSessionChat);

// Export redirects
app.get("/download-csv", (req, res, next) => {
  req.query.format = "csv";
  exportDataset(req, res, next);
});
app.get("/download-updated", (req, res, next) => {
  req.query.format = req.query.format === "excel" ? "excel" : "csv";
  exportDataset(req, res, next);
});

// ─── Express Global Error Handling Middleware ───
app.use((err, req, res, next) => {
  if (err) {
    console.error("[ExpressError]", err.message);
    return res.status(err.status || 400).json({
      success: false,
      error: err.message || "File payload too large or invalid request format."
    });
  }
  next();
});

// Determine base upload and export directory structures (standard and Vercel compatible)
const isVercel = !!process.env.VERCEL;
const uploadDir = isVercel ? '/tmp/uploads' : path.join(__dirname, 'uploads');
const exportDir = isVercel ? '/tmp/exports' : path.join(__dirname, 'exports');

console.log(`[Server] Environment: ${isVercel ? 'Vercel' : 'Local'}`);
console.log(`[Server] Directory uploads: ${uploadDir}`);
console.log(`[Server] Directory exports: ${exportDir}`);

// Ensure folders exist on startup
[uploadDir, exportDir].forEach((dir) => {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    console.error(`[Server] Failed to create directory ${dir}:`, error);
  }
});

// ─── Start HTTP Server ───
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`🚀 SheetSage BI server running on http://localhost:${PORT}`);
  });
  
  // Extend HTTP socket timeout to 15 minutes to allow slow uploads and deep calculations to finish
  server.timeout = 15 * 60 * 1000;
  server.keepAliveTimeout = 15 * 60 * 1000;
}

module.exports = app;
