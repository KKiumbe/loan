const express = require('express');
const { createMPESAConfig, updateMPESAConfig,getTenantSettings } = require('../../controller/mpesa/mpesaConfig.js');
const verifyToken = require('../../middleware/verifyToken.js');

const router = express.Router();

router.post('/create-mp-settings', createMPESAConfig);
router.put('/update-mp-settings', verifyToken, updateMPESAConfig);
router.get('/get-mp-settings',verifyToken, getTenantSettings);



module.exports = router;