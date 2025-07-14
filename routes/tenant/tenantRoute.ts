const express = require('express');
import verifyToken from '../../middleware/verifyToken';
import { updateTenantDetails, getTenantDetails, uploadLogo, fetchTenant, fetchTenantDetails } from '../../controller/tenants/tenantupdate';
import upload from '../../middleware/uploadCustomers/upload';



const router = express.Router();

// Update Tenant Details


router.put('/tenants/:tenantId', verifyToken, updateTenantDetails);

router.get('/tenants/:tenantId',verifyToken, getTenantDetails);

router.put('/logo-upload/:tenantId', upload.single('logo'),uploadLogo );


export default router;

