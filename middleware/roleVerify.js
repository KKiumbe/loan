const ROLE_PERMISSIONS = require("../DatabaseConfig/role.js");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();




const checkAccess = (module, action) => (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      console.error("Authentication failed: req.user is missing.");
      return res.status(403).json({
        error: "Unauthorized",
        details: "User is not authenticated. Please log in.",
      });
    }

    // Extract role
    const role = Array.isArray(user.role) && user.role.length > 0 ? user.role[0] : null;

    console.log("User details:", { role });

    // Validate the role
    if (!role || !ROLE_PERMISSIONS[role]) {
      console.error(`Authorization failed: Role "${role}" is invalid or not defined in ROLE_PERMISSIONS.`);
      return res.status(403).json({
        error: "Forbidden",
        details: `Your role "${role}" is not recognized. Please contact an administrator.`,
      });
    }

    console.log(`Checking permissions for role: "${role}" on module: "${module}" and action: "${action}"`);

    // Check if the role has the required permission for the module and action
    const hasPermission = ROLE_PERMISSIONS[role]?.[module]?.includes(action);

    if (hasPermission) {
      console.log(`Access granted for role "${role}" on ${module}:${action}`);
      return next();
    }

    console.error(`Access denied: Role "${role}" lacks permission for ${module}:${action}`);
    return res.status(403).json({
      error: "Forbidden",
      details: `Your role "${role}" lacks the "${action}" permission for the "${module}" module. Please contact an administrator.`,
    });
  } catch (error) {
    console.error("An error occurred in checkAccess:", error.message);
    return res.status(500).json({
      error: "Internal Server Error",
      details: "An unexpected error occurred while checking access.",
    });
  }
};



module.exports = checkAccess;