"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const client_1 = require("@prisma/client");
const results_1 = require("../../controller/mpesa/results");
const roleVerify_1 = __importDefault(require("../../middleware/roleVerify"));
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const prisma = new client_1.PrismaClient();
router.post('/b2c-result', results_1.handleB2CResult);
router.post('/b2c-timeout', results_1.handleB2CTimeout);
router.post('/accountbalance-result', results_1.handleAccountBalanceResult);
router.post('/accountbalance-timeout', results_1.handleAccountBalanceTimeout);
// Route to handle M-Pesa callback notifications
router.get('/latest-mpesa-balance', verifyToken_1.default, (0, roleVerify_1.default)('mpesa', 'read'), results_1.getLatestBalance);
// Route to handle Lipa Na M-Pesa requests
exports.default = router;
