// uploadMiddleware.js
const multer = require('multer');
const path = require('path');

// Configure storage options for Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads/'); // Directory to save uploaded files
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`); // Unique filename with timestamp
  },
});

// Initialize the Multer middleware
const upload = multer({ storage });

module.exports = upload;
