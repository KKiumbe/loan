"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const org_1 = require("../../controller/organization/org");
const roleVerify_1 = __importDefault(require("../../middleware/roleVerify"));
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const router = express_1.default.Router();
// Create borrower organization (Requires organization:create permission)
router.post('/create-org', verifyToken_1.default, (0, roleVerify_1.default)('organization', 'create'), org_1.createBorrowerOrganization);
// Get all organizations (Authenticated users with read permission)
router.get('/organizations', verifyToken_1.default, (0, roleVerify_1.default)('organization', 'read'), org_1.getOrganizations);
// Get organization admins (Authenticated users with read permission)
router.get('/org-admins', verifyToken_1.default, (0, roleVerify_1.default)('organization', 'read'), org_1.getOrganizationAdmins);
// Get organization by ID (Authenticated users with read permission)
router.get('/organizations/:orgId', verifyToken_1.default, (0, roleVerify_1.default)('organization', 'read'), org_1.getOrganizationById);
// Update organization (Admin only)
router.put('/organizations/:id', verifyToken_1.default, (0, roleVerify_1.default)('organization', 'update'), org_1.updateOrganization);
// Search organizations (Authenticated users with read permission)
router.get('/organizations-search', verifyToken_1.default, org_1.searchOrganizations);
exports.default = router;
