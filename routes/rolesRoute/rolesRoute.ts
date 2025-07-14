import express from "express";
import verifyToken from "../../middleware/verifyToken";
import checkAccess from "../../middleware/roleVerify";
import { assignRole, deleteUser, fetchUser, getAllUsers, getCurrentUser, removeRoles, stripRoles, updateUserDetails } from "../../controller/userManagement/userManagement";





const router = express.Router();

// View all users (Super Admin only)
router.get("/users", verifyToken, checkAccess("user", "read"), getAllUsers);

router.get('/current-user', verifyToken, getCurrentUser);

router.get("/users/:userId", verifyToken, checkAccess("user", "read"), fetchUser);


// // Assign roles to a user
router.post("/assign-roles", verifyToken, checkAccess("user", "update"), assignRole);
router.put("/remove-roles", verifyToken, checkAccess("user", "update"), removeRoles);

router.put("/update-user", verifyToken, updateUserDetails);

// // Delete a user
router.delete("/user/:userId",verifyToken, checkAccess("user", "delete"), deleteUser);

// // Strip all roles from a user
router.post("/user/strip-roles",verifyToken, checkAccess("users", "update"), stripRoles);


export default router;
