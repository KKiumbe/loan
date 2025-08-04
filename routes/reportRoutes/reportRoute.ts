import express from 'express';
const router = express.Router();

import verifyToken from '../../middleware/verifyToken';
const { generateDisbursedLoansPerOrganization } = require('../../controller/reports/loans/loanperorganization.js');

router.get('/loans-per-org', verifyToken, generateDisbursedLoansPerOrganization) ;

export default router;
 