"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const roleVerify_1 = __importDefault(require("../../middleware/roleVerify"));
const getloans_1 = require("../../controller/loan/getloans");
const createloan_1 = require("../../controller/loan/createloan");
const aproveloans_1 = require("../../controller/loan/aproveloans");
const rejectloans_1 = require("../../controller/loan/rejectloans");
const router = express_1.default.Router();
// Create organization admin (Admin only)
router.post('/create-loan', verifyToken_1.default, createloan_1.createLoan);
router.get('/user-loans', verifyToken_1.default, getloans_1.getUserLoans);
//get pending loan requests
router.get('/pending-loans', verifyToken_1.default, getloans_1.getPendingLoanRequests);
//route for admins to fetch pending loand for aproval for mobile
router.get('/loans/pending', verifyToken_1.default, getloans_1.getPendingLoans);
router.get('/loans/stats/current-month', verifyToken_1.default, getloans_1.getCurrentMonthLoanStats);
//router.get('/loans', verifyToken, getLoansGroupedByStatus);
router.get('/get-all-loans', verifyToken_1.default, getloans_1.getAllLoansWithDetails);
//router.get('/get-loan:id', verifyToken, checkAccess('loan', 'read'), getLoanById);
router.patch('/approve-loan/:id', verifyToken_1.default, (0, roleVerify_1.default)('loan', 'approve'), aproveloans_1.approveLoan);
router.put('/reject-loan/:id', verifyToken_1.default, (0, roleVerify_1.default)('loan', 'reject'), rejectloans_1.rejectLoan);
router.get('/loans/organization/:orgId', verifyToken_1.default, getloans_1.getLoansByOrganization);
router.get('/loans-by-status', verifyToken_1.default, getloans_1.getLoansByStatus);
exports.default = router;
