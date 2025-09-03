
import express, { Response, NextFunction,Request } from 'express';
import { z } from 'zod';
import { createBorrowerOrganization, getOrganizationAdmins, getOrganizationById, getOrganizations, searchOrganizations, updateOrganization } from '../../controller/organization/org';

import checkAccess from '../../middleware/roleVerify';
import verifyToken from '../../middleware/verifyToken';
import { hardDeleteBorrowerOrganization, softDeleteBorrowerOrganization } from '../../controller/organization/deleteOrg';


const router = express.Router();

// Create borrower organization (Requires organization:create permission)
router.post(
  '/create-org', verifyToken,
  checkAccess('organization', 'create'), createBorrowerOrganization

);




// Get all organizations (Authenticated users with read permission)
router.get('/organizations',verifyToken, checkAccess('organization', 'read'), getOrganizations);

// Get organization admins (Authenticated users with read permission)
router.get('/org-admins',verifyToken, checkAccess('organization', 'read'), getOrganizationAdmins);

// Get organization by ID (Authenticated users with read permission)
router.get('/organizations/:orgId',verifyToken, checkAccess('organization', 'read'), getOrganizationById);

// Update organization (Admin only)
router.put(
  '/organizations/:id',verifyToken,
  checkAccess('organization', 'update'),
  updateOrganization
);

// Search organizations (Authenticated users with read permission)
router.get('/organizations-search',verifyToken, searchOrganizations);



//delete routes


router.delete(
  '/soft-delete-org/:organizationId',
  verifyToken,
  softDeleteBorrowerOrganization
);

// Hard delete organization
router.delete(
  '/delete-org/:organizationId',
 verifyToken,
  hardDeleteBorrowerOrganization
);

export default router;