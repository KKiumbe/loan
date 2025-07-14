// routes/dashboard.js
import express from 'express';
import verifyToken from '../../middleware/verifyToken';
import { getUserLoanStats } from '../../controller/stats/stats';

const router = express.Router();


router.get('/stats',verifyToken, getUserLoanStats);

export default router;
