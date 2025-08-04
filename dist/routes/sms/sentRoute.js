"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sentHistory_1 = require("../../controller/sms/sentHistory");
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const router = express_1.default.Router();
router.get('/sms-history', verifyToken_1.default, sentHistory_1.getSentSmsHistory);
exports.default = router;
