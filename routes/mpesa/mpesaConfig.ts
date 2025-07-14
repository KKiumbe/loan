import express from 'express';
import verifyToken from '../../middleware/verifyToken';
import { createMPESAConfig, getTenantSettings, updateMPESAConfig } from '../../controller/mpesa/mpesaConfig';

const router = express.Router();

router.post('/create-mp-settings', createMPESAConfig);
router.put('/update-mp-settings', updateMPESAConfig);
//router.get('/get-mp-settings',verifyToken, getTenantSettings);



export default router;