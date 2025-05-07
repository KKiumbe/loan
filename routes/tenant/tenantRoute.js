const express = require('express');
const { updateTenantDetails, getTenantDetails, uploadLogo } = require('../../controller/tenants/tenantupdate.js');
const verifyToken = require('../../middleware/verifyToken.js');
const upload = require('../../controller/tenants/logoUploadMiddleware.js');


const router = express.Router();

// Update Tenant Details


router.put('/tenants/:tenantId', verifyToken, updateTenantDetails);

router.get('/tenants/:tenantId',verifyToken, getTenantDetails);

router.put('/logo-upload/:tenantId', upload.single('logo'),uploadLogo );


module.exports = router;

