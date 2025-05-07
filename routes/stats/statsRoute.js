// routes/dashboard.js
const express = require('express');
const { getDashboardStats } = require('../../controller/dashboadstats/dashboard.js');
const verifyToken = require('../../middleware/verifyToken.js');
const router = express.Router();


router.get('/stats',verifyToken, getDashboardStats);

module.exports = router;
