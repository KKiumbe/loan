"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const sms_1 = require("../../controller/sms/sms");
const router = express_1.default.Router();
// Endpoint to fetch SMS balance
router.get('/get-sms-balance', verifyToken_1.default, sms_1.getLatestBalance);
//done testing mult sms
exports.default = router;
