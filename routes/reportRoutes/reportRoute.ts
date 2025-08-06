import express from 'express';


import verifyToken from '../../middleware/verifyToken';
import { generateDisbursedLoansPerOrganization } from '../../controller/reports/loans/loanperorganization';
import { generateEmployeesPerOrganization } from '../../controller/reports/employees/employeesPerOrg';

const router = express.Router();
router.get('/loans-per-org', verifyToken, generateDisbursedLoansPerOrganization) ;

router.get('/employees-per-org', verifyToken, generateEmployeesPerOrganization) ;

export default router;
 