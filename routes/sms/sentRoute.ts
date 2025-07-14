import express from 'express';
import { getSentSmsHistory } from '../../controller/sms/sentHistory';
import verifyToken from '../../middleware/verifyToken';

const router = express.Router();

router.get('/sms-history', verifyToken, getSentSmsHistory);

export default router;
