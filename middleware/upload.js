const multer = require("multer");
const path = require("path");
const fs = require("fs");

/**
 * Express File Upload Middleware using Multer
 * ------------------------------------------
 * Educational Overview:
 * Multer is a Node.js middleware for handling `multipart/form-data`, which is primarily
 * used for uploading files in HTTP requests.
 * 
 * Key Features Configured Here:
 * 1. Dynamic Upload Directory: Compatible with local storage & Vercel serverless environments (/tmp).
 * 2. Disk Storage Engine: Saves incoming files with timestamped unique filenames.
 * 3. File Filter: Restricts uploads strictly to `.pdf`, `.xlsx`, `.xls`, and `.csv`.
 * 4. File Size Limits: Restricts uploads to 25MB max to protect server memory.
 */

const isVercel = !!process.env.VERCEL;
const uploadPath = isVercel ? '/tmp/uploads/' : path.join(__dirname, '../uploads/');

// Ensure upload directory exists synchronously on startup
try {
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
} catch (error) {
  console.error("Failed to create upload directory:", error);
}

// Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Sanitize filename and prepend current timestamp to prevent overwrites
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${Date.now()}-${sanitizedName}`);
  },
});

// File Filter Function
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.pdf', '.xlsx', '.xls', '.csv'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type '${ext}'. Supported formats are: PDF (.pdf), Excel (.xlsx, .xls), and CSV (.csv).`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB Max File Size Limit (Handles 37MB+ heavy files)
  },
});

module.exports = { upload };

