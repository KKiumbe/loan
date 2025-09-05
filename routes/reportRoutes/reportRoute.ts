import express from 'express';


import verifyToken from '../../middleware/verifyToken';
import { disbursedLoansPerOrganization, generateDisbursedLoansPerOrganization } from '../../controller/reports/loans/loanperorganization';
import { generateEmployeesPerOrganization } from '../../controller/reports/employees/employeesPerOrg';
import { generateLoanSummaryReport } from '../../controller/reports/loans/loanSummaries';

const router = express.Router();
router.post('/loans-per-org', verifyToken, generateDisbursedLoansPerOrganization) ;

router.post('/loans-per-one-org', verifyToken, disbursedLoansPerOrganization) ;

router.get('/employees-per-org', verifyToken, generateEmployeesPerOrganization) ;

router.post('/loan-summary-per-org', verifyToken, generateLoanSummaryReport) ;

export default router;
 