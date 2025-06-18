const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createEmployee, deleteEmployee, getEmployeeUsers, searchEmployeeByName, searchEmployeeByPhone, getEmployeeById, getUserDetailsById, updateEmployee } = require('../../controller/employee/employee.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { bulkUploadFromCSV } = require('./bulkEmployeeUpload.js');
const upload = require('../../middleware/uploadCustomers/upload.js');
const router = express.Router();


// Create Employee (ADMIN, ORG_ADMIN)
router.post('/create-employee', verifyToken, checkAccess('employee', 'create'), createEmployee);

router.post(
  '/employees/bulk-upload-csv',
  upload.single('file'), // 'file' should be the field name in the form-data
  bulkUploadFromCSV
);

//employee details page using id params , route customer-details
router.get('/employee-details/:userId', verifyToken, checkAccess('employee', 'read'), getUserDetailsById);
router.put('/update-employee/:userId', verifyToken, checkAccess('employee', 'read'), updateEmployee);
// Get Employee by ID (ADMIN, ORG_ADMIN, EMPLOYEE)
router.get('/customers/employee-users', verifyToken, checkAccess('employee', 'read'), getEmployeeUsers);

// Update Employee (ADMIN, ORG_ADMIN, EMPLOYEE)
//router.put('/:employeeId', verifyToken, checkAccess('employee', 'update'), updateEmployee);

// Delete Employee (ADMIN, ORG_ADMIN)
router.delete('/:employeeId', verifyToken, checkAccess('employee', 'delete'), deleteEmployee);



router.get(
  '/employees/search-by-name',
  verifyToken,
  checkAccess('employee', 'read'),
  searchEmployeeByName
);

// Search by phone
router.get(
  '/employees/search-by-phone',
  verifyToken,
  checkAccess('employee', 'read'),
  searchEmployeeByPhone
);

module.exports = router;