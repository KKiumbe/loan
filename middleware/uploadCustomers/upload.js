// middleware/uploadCSV.js
const multer = require("multer");
const path = require("path");

// Store in memory or disk, here we use memory
const storage = multer.memoryStorage();

const uploadCSV = multer({
  storage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    if (ext !== ".csv") {
      return cb(new Error("Only CSV files are allowed"), false);
    }
    cb(null, true);
  },
});

module.exports = uploadCSV;
