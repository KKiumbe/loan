"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// routes/dashboard.js
const express_1 = __importDefault(require("express"));
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const stats_1 = require("../../controller/stats/stats");
const router = express_1.default.Router();
router.get('/stats', verifyToken_1.default, stats_1.getUserLoanStats);
exports.default = router;
