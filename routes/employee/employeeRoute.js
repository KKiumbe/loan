const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createEmployee, getEmployee, updateEmployee, deleteEmployee } = require('../../controller/employee/employee.js');
const checkAccess = require('../../middleware/roleVerify.js');
const router = express.Router();


// Create Employee (ADMIN, ORG_ADMIN)
router.post('/create-employee', verifyToken, checkAccess('employee', 'create'), createEmployee);

// Get Employee by ID (ADMIN, ORG_ADMIN, EMPLOYEE)
router.get('/:employeeId', verifyToken, checkAccess('employee', 'read'), getEmployee);

// Update Employee (ADMIN, ORG_ADMIN, EMPLOYEE)
router.put('/:employeeId', verifyToken, checkAccess('employee', 'update'), updateEmployee);

// Delete Employee (ADMIN, ORG_ADMIN)
router.delete('/:employeeId', verifyToken, checkAccess('employee', 'delete'), deleteEmployee);

module.exports = router;