// uploadMiddleware.js
import multer from 'multer';
import path from 'path';

import { Request } from 'express';

// Configure storage options for Multer
const storage = multer.diskStorage({
  destination: (req: Request, file, cb) => {
    cb(null, './uploads/'); //


  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`); // Unique filename with timestamp
  },
});

// Initialize the Multer middleware
const upload = multer({ storage });

export default upload;
