const express = require('express');
const { upload, uploadCustomers, updateCustomersClosingBalance, updateCustomersDetails } = require('../../controller/fileupload/uploadscript.js');
const verifyToken = require('../../middleware/verifyToken.js');

const router = express.Router();

// Route for uploading customer data
router.post('/upload-customers', upload.single('file'), verifyToken, uploadCustomers);
//router.post('/update-customers', upload.single('file'), verifyToken, updateCustomersClosingBalance);
//router.post('/update-customers-locality', upload.single('file'),verifyToken, updateCustomersDetails);


// Export the router to use in your main app
module.exports = router;
   