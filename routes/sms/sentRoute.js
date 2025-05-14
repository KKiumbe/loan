// routes/sms/smsRoutes.js

const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { getSentSmsHistory } = require('../../controller/sms/sentHistory.js');
const router = express.Router();


router.get('/sms-history', verifyToken, getSentSmsHistory);

module.exports = router;
