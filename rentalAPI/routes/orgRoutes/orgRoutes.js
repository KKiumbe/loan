

const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createOrganization, createOrgAdmin } = require('../../controller/organization/org.js');


const router = express.Router();


app.post('/organizations', verifyToken, createOrganization);
app.post('/org-admins', verifyToken, createOrgAdmin);



module.exports = router;