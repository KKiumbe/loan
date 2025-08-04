import express from 'express';


import verifyToken from '../../middleware/verifyToken';
import { generateDisbursedLoansPerOrganization } from '../../controller/reports/loans/loanperorganization';

const router = express.Router();
router.get('/loans-per-org', verifyToken, generateDisbursedLoansPerOrganization) ;

export default router;
 