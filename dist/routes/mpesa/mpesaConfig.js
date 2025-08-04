"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const mpesaConfig_1 = require("../../controller/mpesa/mpesaConfig");
const router = express_1.default.Router();
router.post('/create-mp-settings', mpesaConfig_1.createMPESAConfig);
router.put('/update-mp-settings', mpesaConfig_1.updateMPESAConfig);
//router.get('/get-mp-settings',verifyToken, getTenantSettings);
router.post('/create-mp-charges', verifyToken_1.default, mpesaConfig_1.createDefaultTransactionBands);
exports.default = router;
