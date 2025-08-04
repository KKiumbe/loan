"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employee_1 = require("../../controller/employee/employee");
const roleVerify_1 = __importDefault(require("../../middleware/roleVerify"));
const upload_1 = __importDefault(require("../../middleware/uploadCustomers/upload"));
const bulkEmployeeUpload_1 = require("./bulkEmployeeUpload");
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const router = express_1.default.Router();
// Create Employee (ADMIN, ORG_ADMIN)
router.post('/create-employee', verifyToken_1.default, (0, roleVerify_1.default)('employee', 'create'), employee_1.createEmployee);
router.post('/employees/bulk-upload-csv', verifyToken_1.default, upload_1.default.single('file'), // 'file' should be the field name in the form-data
bulkEmployeeUpload_1.bulkUploadFromCSV);
//employee details page using id params , route customer-details
router.get('/employee-details/:userId', verifyToken_1.default, employee_1.getEmployeeDetails);
router.put('/update-employee/:userId', verifyToken_1.default, employee_1.updateEmployee);
// Get Employee by ID (ADMIN, ORG_ADMIN, EMPLOYEE)
router.get('/customers/employee-users', verifyToken_1.default, employee_1.getEmployeeUsers);
//getEmployeesWithoutUserProfiles
router.get('/customers/employee', verifyToken_1.default, employee_1.getEmployeesWithoutUserProfiles);
// Update Employee (ADMIN, ORG_ADMIN, EMPLOYEE)
//router.put('/:employeeId', verifyToken, checkAccess('employee', 'update'), updateEmployee);
// Delete Employee (ADMIN, ORG_ADMIN)
router.delete('/employee/:id', verifyToken_1.default, employee_1.deleteEmployee);
router.get('/employees/search-by-name', verifyToken_1.default, employee_1.searchEmployeeByName);
// Search by phone
router.get('/employees/search-by-phone', verifyToken_1.default, employee_1.searchEmployeeByPhone);
exports.default = router;
