const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const {  createBorrowerOrganization, getOrganizations, getOrganizationAdmins, searchOrganizations, getOrganizationById } = require('../../controller/organization/org.js');
const { createOrgAdmin } = require('../../controller/users/users.js');
const checkAccess = require('../../middleware/roleVerify.js');
const router = express.Router();


// Create organization admin (Admin only)


router.post('/create-org', verifyToken,  createBorrowerOrganization);

router.get('/organizations', verifyToken, getOrganizations);
router.get('/org-admins', verifyToken, getOrganizationAdmins);

router.get(
  '/organizations/:orgId',
  verifyToken,
  getOrganizationById
);

router.get(
  '/organizations/search',
  verifyToken,
  checkAccess('organizations', 'read'),
  searchOrganizations
);

// Create employee (Org Admin only)


module.exports = router;