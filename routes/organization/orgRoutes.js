const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const {  createBorrowerOrganization } = require('../../controller/organization/org.js');
const { createOrgAdmin } = require('../../controller/users/users.js');
const router = express.Router();


// Create organization admin (Admin only)


router.post('/create-org', verifyToken,  createBorrowerOrganization);

// Create employee (Org Admin only)


module.exports = router;