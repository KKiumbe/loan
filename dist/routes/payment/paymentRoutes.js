"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const getAllPayments_1 = require("../../controller/payments/getAllPayments");
//import createRepayment from '../../controller/loan/loanRepayment';
const router = express_1.default.Router();
router.get('/loan-payouts', verifyToken_1.default, getAllPayments_1.getAllLoanPayouts);
//create organization payment 
//router.post('/create-payment', verifyToken, checkAccess('payment', 'create'), createRepayment);
router.get('/payment-confirmations', verifyToken_1.default, getAllPayments_1.getPaymentConfirmations);
router.get('/payment-batches', verifyToken_1.default, getAllPayments_1.getPaymentBatches);
exports.default = router;
