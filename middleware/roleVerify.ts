import { Request, Response, NextFunction } from 'express';
import ROLE_PERMISSIONS from '../DatabaseConfig/role';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Express Request to include user
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string | string[];
    tenantId: number;
    [key: string]: any;
  };
}

// Middleware factory
const checkAccess = (module: string, action: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      const user = req.user;

      if (!user) {
        console.error('Authentication failed: req.user is missing.');
        res.status(403).json({
          error: 'Unauthorized',
          details: 'User is not authenticated. Please log in.',
        });
        return;
      }

      // Extract role as string
      const role: string | undefined = Array.isArray(user.role) && user.role.length > 0
        ? String(user.role[0])
        : typeof user.role === 'string'
          ? user.role
          : undefined;

      console.log('User details:', { role });

      // Validate role
      if (!role || !(role in ROLE_PERMISSIONS)) {
        console.error(`Authorization failed: Role "${role}" is invalid or not defined in ROLE_PERMISSIONS.`);
        res.status(403).json({
          error: 'Forbidden',
          details: `Your role "${role}" is not recognized. Please contact an administrator.`,
        });
        return;
      }

      console.log(`Checking permissions for role: "${role}" on module: "${module}" and action: "${action}"`);

      // Check if the module exists for the role
      if (!ROLE_PERMISSIONS[role] || !ROLE_PERMISSIONS[role][module]) {
        console.error(`Access denied: Module "${module}" not defined for role "${role}"`);
        res.status(403).json({
          error: 'Forbidden',
          details: `Your role "${role}" lacks access to the "${module}" module.`,
        });
        return;
      }

      // Check permissions based on the type of ROLE_PERMISSIONS[role][module]
      const modulePermissions = ROLE_PERMISSIONS[role][module];
      let hasPermission = false;

      if (Array.isArray(modulePermissions)) {
        // If modulePermissions is a string array, check if action exists in it
        hasPermission = modulePermissions.includes(action);
      } else if (typeof modulePermissions === 'object' && modulePermissions !== null) {
        // Check if the action is a valid key in the object (e.g., 'create')
        if (action in modulePermissions) {
          hasPermission = modulePermissions[action] === true;
        }
      }

      if (hasPermission) {
        console.log(`Access granted for role "${role}" on ${module}:${action}`);
        return next();
      }

      console.error(`Access denied: Role "${role}" lacks permission for ${module}:${action}`);
      res.status(403).json({
        error: 'Forbidden',
        details: `Your role "${role}" lacks the "${action}" permission for the "${module}" module. Please contact an administrator.`,
      });
    } catch (error: any) {
      console.error('An error occurred in checkAccess:', error.message);
      res.status(500).json({
        error: 'Internal Server Error',
        details: 'An unexpected error occurred while checking access.',
      });
    }
  };
};

export default checkAccess;