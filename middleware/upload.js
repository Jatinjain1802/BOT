const multer = require("multer");
const path = require("path");

const fs = require("fs");
const isVercel = !!process.env.VERCEL;
const uploadPath = isVercel ? '/tmp/uploads/' : path.join(__dirname, '../uploads/');

// Ensure upload directory exists
try {
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
} catch (error) {
  console.error("Failed to create upload directory:", error);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Re-verify existence or just provide path
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

module.exports = { upload };
