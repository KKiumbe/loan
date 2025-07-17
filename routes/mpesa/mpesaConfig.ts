import express from 'express';
import verifyToken from '../../middleware/verifyToken';
import { createDefaultTransactionBands, createMPESAConfig, createTransactionCharge, updateMPESAConfig } from '../../controller/mpesa/mpesaConfig';

const router = express.Router();

router.post('/create-mp-settings', createMPESAConfig);
router.put('/update-mp-settings', updateMPESAConfig);
//router.get('/get-mp-settings',verifyToken, getTenantSettings);

router.post('/create-mp-charges',verifyToken, createDefaultTransactionBands);

export default router;