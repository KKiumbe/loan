import express from 'express';

import { createEmployee, getEmployeeUsers, searchEmployeeByPhone, updateEmployee, getEmployeesWithoutUserProfiles, getEmployeeDetails, hardDeleteEmployeeUser, getEmployeeUsersByOrgID, searchEmployeeByName, getEmployeesByOrganization } from '../../controller/employee/employee';
import checkAccess from '../../middleware/roleVerify';

import upload from '../../middleware/uploadCustomers/upload';
import { bulkUploadFromCSV } from './bulkEmployeeUpload';
import verifyToken from '../../middleware/verifyToken';
const router = express.Router();


// Create Employee (ADMIN, ORG_ADMIN)
router.post('/create-employee',verifyToken,  checkAccess('employee', 'create'), createEmployee);

router.post(
  '/employees/bulk-upload-csv', verifyToken,
  upload.single('file'), // 'file' should be the field name in the form-data
  bulkUploadFromCSV
);

//employee details page using id params , route customer-details
router.get('/employee-details/:userId',verifyToken,   getEmployeeDetails);
router.put('/update-employee/:userId', verifyToken, updateEmployee);
// Get Employee by ID (ADMIN, ORG_ADMIN, EMPLOYEE)
router.get('/customers/employee-users',verifyToken,  getEmployeeUsers);
router.get('/customers/employee-users-by-ID',verifyToken,  getEmployeeUsersByOrgID);


//getEmployeesWithoutUserProfiles

router.get('/customers/employee',verifyToken,  getEmployeesWithoutUserProfiles);

// Update Employee (ADMIN, ORG_ADMIN, EMPLOYEE)
//router.put('/:employeeId', verifyToken, checkAccess('employee', 'update'), updateEmployee);

// Delete Employee (ADMIN, ORG_ADMIN)
router.delete('/employee-user/:userId', verifyToken, hardDeleteEmployeeUser);

//getEmployeesByOrganization

router.get(
  '/employees/by-organization',verifyToken,
 
  
  getEmployeesByOrganization
)

router.get(
  '/employees/search-by-name',verifyToken,
  
 
  searchEmployeeByName
);

// Search by phone
router.get(
  '/employees/search-by-phone',verifyToken,
 
  
  searchEmployeeByPhone
);
export default router;