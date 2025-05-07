const express = require('express');
const axios = require('axios');
const { getSmsBalance } = require('../../controller/sms/sms.js');
const verifyToken = require('../../middleware/verifyToken.js');
const router = express.Router();


// Endpoint to fetch SMS balance
router.get('/get-sms-balance',verifyToken, getSmsBalance 
);
//done testing mult sms
module.exports = router;
