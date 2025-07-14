import multer, { FileFilterCallback } from 'multer';
import path from 'path';

const storage = multer.memoryStorage();

const uploadCSV = multer({
  storage,
  fileFilter: (
    req: Express.Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb;
    }
    cb(null, true);
  },
});

export default uploadCSV;
