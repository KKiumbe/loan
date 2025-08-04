"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const roleVerify_1 = __importDefault(require("../../middleware/roleVerify"));
const sms_1 = require("../../controller/sms/sms");
const smsConfig_1 = require("../../controller/smsConfig/smsConfig");
const router = express_1.default.Router();
//SMS routes for sending bulk sms
//router.post('/send-to-all', verifyToken, checkAccess('customer', 'read'), sendToAll);//done
//router.post('/send-to-group', verifyToken, checkAccess('customer', 'read'), sendToGroup); //done sending bulk sms to all tenants of a landlord or building
router.post('/send-sms', verifyToken_1.default, (0, roleVerify_1.default)('customer', 'read'), sms_1.sendToOne); //done
//SMS CONFIGURATION
router.put('/sms-config-update', verifyToken_1.default, smsConfig_1.updateSMSConfig); //done
router.post('/sms-config', verifyToken_1.default, smsConfig_1.createSMSConfig); //done
//SMS for debt collection
//route for fetching SMS records
// router.get('/sms-delivery-report' ,updateSmsDeliveryStatus);
// router.get('/sms-history',verifyToken, getSmsMessages);
// //router.post('/auto-sms' , sendSMS)
exports.default = router;
