"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const tenantupdate_1 = require("../../controller/tenants/tenantupdate");
const upload_1 = __importDefault(require("../../middleware/uploadCustomers/upload"));
const router = express.Router();
// Update Tenant Details
router.put('/tenants/:tenantId', verifyToken_1.default, tenantupdate_1.updateTenantDetails);
router.get('/tenants/:tenantId', verifyToken_1.default, tenantupdate_1.getTenantDetails);
router.put('/logo-upload/:tenantId', upload_1.default.single('logo'), tenantupdate_1.uploadLogo);
exports.default = router;
