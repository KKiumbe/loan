"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const roleVerify_1 = __importDefault(require("../../middleware/roleVerify"));
const userManagement_1 = require("../../controller/userManagement/userManagement");
const router = express_1.default.Router();
// View all users (Super Admin only)
router.get("/users", verifyToken_1.default, (0, roleVerify_1.default)("user", "read"), userManagement_1.getAllUsers);
router.get('/current-user', verifyToken_1.default, userManagement_1.getCurrentUser);
router.get("/users/:userId", verifyToken_1.default, (0, roleVerify_1.default)("user", "read"), userManagement_1.fetchUser);
// // Assign roles to a user
router.post("/assign-roles", verifyToken_1.default, (0, roleVerify_1.default)("user", "update"), userManagement_1.assignRole);
router.put("/remove-roles", verifyToken_1.default, (0, roleVerify_1.default)("user", "update"), userManagement_1.removeRoles);
router.put("/update-user", verifyToken_1.default, userManagement_1.updateUserDetails);
// // Delete a user
router.delete("/user/:userId", verifyToken_1.default, (0, roleVerify_1.default)("user", "delete"), userManagement_1.deleteUser);
// // Strip all roles from a user
router.post("/user/strip-roles", verifyToken_1.default, (0, roleVerify_1.default)("users", "update"), userManagement_1.stripRoles);
exports.default = router;
