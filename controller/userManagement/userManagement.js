const { PrismaClient } = require('@prisma/client');
const ROLE_PERMISSIONS = require("./../../DatabaseConfig/role.js");

const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

/**
 * Get all users
 */





const getAllUsers = async (req, res) => {
  const {tenantId} = req.user; // Extract tenantId from the authenticated user

  console.log(`this is the tenenant id ${tenantId}`);

  if (!tenantId) {
    return res.status(400).json({ error: "Tenant ID is required" });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        tenantId, // Ensure users belong to the authenticated user's tenant
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      
        createdBy:true,
        status:true,
        createdAt: true,
        lastLogin :true,
        loginCount:true,
       // userActivities:true,

      },
    });

    // If no users are found or access is invalid
    if (!users.length) {
      return res.status(403).json({ message: "You can only perform actions within your own tenant." });
    }

    res.status(200).json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users", details: error.message });
  }
};


/**
 * Assign roles to a user
 */

const assignRole = async (req, res) => {
  const { userId, role } = req.body;

  const { role: requesterRole, tenantId: requesterTenantId } = req.user;



  // Validate input
  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  if (!Array.isArray(requesterRole)) {
    return res.status(400).json({ error: "Roles must be an array" });
  }

  const validRoles = Object.keys(ROLE_PERMISSIONS);
  const invalidRoles = requesterRole.filter(role => !validRoles.includes(role));

  if (invalidRoles.length > 0) {
    return res.status(400).json({ 
      error: "Invalid roles", 
      details: invalidRoles 
    });
  }

  try {
    const userToUpdate = await prisma.user.findUnique({
      where: { id: parseInt(userId,10) },
      select: { tenantId: true },
    });

    if (!userToUpdate) {
      return res.status(404).json({ error: "User not found" });
    }

    if (userToUpdate.tenantId !== requesterTenantId) {
      return res.status(403).json({ 
        error: "Access denied. You can only assign roles to users in your tenant." 
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId,10) },
      data: { role },
    });

    res.status(200).json({ 
      message: "Roles assigned successfully", 
      user: updatedUser 
    });
  } catch (error) {
    console.error("Failed to assign roles:", error.message);
    res.status(500).json({ 
      error: "Failed to assign roles", 
      details: "An unexpected error occurred" 
    });
  }
};


const removeRoles = async (req, res) => {
  const { userId, rolesToRemove } = req.body;
  const { role: requesterRole, tenantId: requesterTenantId } = req.user;

  // Validate input
  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  if (!Array.isArray(rolesToRemove)) {
    return res.status(400).json({ error: "Roles to remove must be an array" });
  }

  if (!Array.isArray(requesterRole)) {
    return res.status(400).json({ error: "Requester roles must be an array" });
  }

  const validRoles = Object.keys(ROLE_PERMISSIONS);
  const invalidRoles = rolesToRemove.filter(role => !validRoles.includes(role));

  if (invalidRoles.length > 0) {
    return res.status(400).json({ 
      error: "Invalid roles specified for removal", 
      details: invalidRoles 
    });
  }

  try {
    // Get the user and their current roles
    const userToUpdate = await prisma.user.findUnique({
      where: { id: parseInt(userId, 10) },
      select: { 
        tenantId: true,
        role: true 
      },
    });

    if (!userToUpdate) {
      return res.status(404).json({ error: "User not found" });
    }

    if (userToUpdate.tenantId !== requesterTenantId) {
      return res.status(403).json({ 
        error: "Access denied. You can only remove roles from users in your tenant." 
      });
    }

    // Calculate new roles by filtering out the roles to remove
    const currentRoles = Array.isArray(userToUpdate.role) ? userToUpdate.role : [];
    const updatedRoles = currentRoles.filter(
      role => !rolesToRemove.includes(role)
    );

    // Update the user with the new role set
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId, 10) },
      data: { role: updatedRoles },
    });

    res.status(200).json({ 
      message: "Roles removed successfully", 
      user: updatedUser 
    });
  } catch (error) {
    console.error("Failed to remove roles:", error.message);
    res.status(500).json({ 
      error: "Failed to remove roles", 
      details: "An unexpected error occurred" 
    });
  }
};






const updateUserDetails = async (req, res) => {
  const {
    userId,
    firstName,
    lastName,
    email,
    phoneNumber,
    gender,
    county,
    town,
    password,
    currentPassword,
  } = req.body;

  // Log entire req.user for debugging


  const { user: requesterId, role: requesterRole, tenantId: requesterTenantId } = req.user || {};


  if (!requesterId) {
    return res.status(401).json({ error: "Authentication failed: No user ID in request" });
  }

  const targetUserId = userId || requesterId;
  const isAdmin = requesterRole?.includes('ADMIN');
  const isSelfUpdate = targetUserId === requesterId;


  if (!isAdmin && !isSelfUpdate) {
    return res.status(403).json({ message: 'Access denied. Only admins or the user themselves can update details.' });
  }

  const updateData = {};
  if (firstName) updateData.firstName = firstName;
  if (lastName) updateData.lastName = lastName;
  if (email) updateData.email = email;
  if (phoneNumber) updateData.phoneNumber = phoneNumber;
  if (gender) updateData.gender = gender;
  if (county) updateData.county = county;
  if (town) updateData.town = town;

  try {
    const userToUpdate = await prisma.user.findUnique({
      where: { id: targetUserId }, // Use targetUserId directly
      select: { tenantId: true, password: true },
    });

    if (!userToUpdate) {
      return res.status(404).json({ error: "User not found" });
    }

    if (isAdmin && userToUpdate.tenantId !== requesterTenantId) {
      return res.status(403).json({
        error: "Access denied. You can only update users in your tenant.",
      });
    }

    if (password) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required to update password" });
      }
      const isValid = await bcrypt.compare(currentPassword, userToUpdate.password);
      if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
    });

    res.status(200).json({
      message: "User details updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Failed to update user details:", error.message);
    res.status(500).json({
      error: "Failed to update user details",
      details: error.message,
    });
  }
};










/**
 * Delete a user
 */
const deleteUser = async (req, res) => {
  const { userId } = req.params;
  const { tenantId: requesterTenantId, role: requesterRole, id: requesterId } = req.user;

  // Ensure userId is an integer
  const userIdInt = parseInt(userId, 10);
  const requesterIdInt = parseInt(requesterId, 10);

  // Check if userId is a valid integer
  if (isNaN(userIdInt)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  // Prevent deleting the logged-in admin user (self-deletion)
  if (userIdInt === requesterIdInt) {
    return res.status(403).json({ error: "You cannot delete your own account" });
  }

  // Check if the requester is an admin
  if (!requesterRole.includes('ADMIN')) {
    // Verify if the user belongs to the same tenant
    const userToDelete = await prisma.user.findUnique({
      where: { id: userIdInt },
      select: { tenantId: true },
    });

    if (!userToDelete) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the user to be deleted belongs to the same tenant as the requester
    if (userToDelete.tenantId !== requesterTenantId) {
      return res.status(403).json({
        error: "Access denied. You can only delete users in your tenant.",
      });
    }
  }

  try {
    // Delete the user
    await prisma.user.delete({
      where: { id: userIdInt },
    });

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Failed to delete user:", error.message);
    res.status(500).json({ error: "Failed to delete user", details: error.message });
  }
};



/**
 * Strip all roles from a user
 */
const stripRoles = async (req, res) => {
  const { userId } = req.body;
  const { id: requesterId, role: requesterRole } = req.user;

  // Check if the logged-in user is trying to strip their own roles
  if (requesterId === userId) {
    return res.status(400).json({ message: "You cannot strip your own roles." });
  }

  // Check if the requester is an admin
  if (!requesterRole.includes('ADMIN')) {
    return res.status(403).json({ message: 'Access denied. Only admins can strip roles.' });
  }

  try {
    // Update the user's roles to an empty array (strip all roles)
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { roles: [] }, // Clear the roles array
    });

    res.status(200).json({ message: "All roles stripped from user", user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Failed to strip roles", details: error.message });
  }
};



 
const fetchUser = async (req, res) => {
  const { userId:id } = req.params; // User ID from the request parameters
  const { tenantId, role } = req.user; // Assuming tenantId and role come from authentication middleware

  try {
    // Fetch user details ensuring tenant isolation
    const user = await prisma.user.findFirst({
      where: {
        id: parseInt(id, 10),
        tenantId, // Ensure user belongs to the same tenant
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        gender: true,
        county: true,
        town: true,
        role: true,
       
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found or does not belong to your tenant.' });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details.', details: error.message });
  }
};









module.exports = {
  getAllUsers,
  assignRole,
  deleteUser,
  stripRoles,
  updateUserDetails,

  fetchUser,
  removeRoles
};
