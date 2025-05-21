// routes/dashboard.js
const express = require('express');
const { getDashboardStats } = require('../../controller/dashboadstats/dashboard.js');
const verifyToken = require('../../middleware/verifyToken.js');
const { getUserLoanStats } = require('../../controller/stats/stats.js');
const router = express.Router();


router.get('/stats',verifyToken, getUserLoanStats);

module.exports = router;
