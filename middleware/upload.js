const multer = require("multer");
const path = require("path");

const fs = require("fs");
const isVercel = process.env.VERCEL === '1';
const uploadPath = isVercel ? '/tmp/uploads/' : './uploads/';

// Ensure upload directory exists
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadPath,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

module.exports = { upload };
