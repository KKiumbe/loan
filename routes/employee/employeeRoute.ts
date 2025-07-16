import express from 'express';

import { createEmployee, deleteEmployee, getEmployeeUsers, searchEmployeeByName, searchEmployeeByPhone, updateEmployee, getEmployeesWithoutUserProfiles, getEmployeeDetails } from '../../controller/employee/employee';
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
router.get('/employee-details/:userId',verifyToken,  checkAccess('employee', 'read'), getEmployeeDetails);
router.put('/update-employee/:userId', verifyToken,checkAccess('employee', 'read'), updateEmployee);
// Get Employee by ID (ADMIN, ORG_ADMIN, EMPLOYEE)
router.get('/customers/employee-users',verifyToken, checkAccess('employee', 'read'), getEmployeeUsers);


//getEmployeesWithoutUserProfiles

router.get('/customers/employee',verifyToken, checkAccess('employee', 'read'), getEmployeesWithoutUserProfiles);

// Update Employee (ADMIN, ORG_ADMIN, EMPLOYEE)
//router.put('/:employeeId', verifyToken, checkAccess('employee', 'update'), updateEmployee);

// Delete Employee (ADMIN, ORG_ADMIN)
router.delete('/employee/:id', verifyToken,checkAccess('employee', 'delete'), deleteEmployee);



router.get(
  '/employees/search-by-name',verifyToken,
  
  checkAccess('employee', 'read'),
  searchEmployeeByName
);

// Search by phone
router.get(
  '/employees/search-by-phone',verifyToken,
 
  checkAccess('employee', 'read'),
  searchEmployeeByPhone
);
export default router;