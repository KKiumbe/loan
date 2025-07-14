import { Request, Response, NextFunction } from 'express';
import { verify } from 'jsonwebtoken';

export interface TokenPayload {
  id: number;
  role: string[];
  tenantId: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  tenantName: string;
  organizationId?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

const verifyToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const token = req.cookies?.token;

  if (!token) {
    console.log('No token provided');
    res.status(401).json({ message: 'Authentication token is required' });
    return;
  }

  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is missing');
    res.status(500).json({ message: 'Server configuration error: JWT_SECRET missing' });
    return;
  }

  try {
    const decoded = verify(token, process.env.JWT_SECRET) as TokenPayload;
    console.log('Token verified, user:', decoded);
    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof Error) {
      console.error('Token verification error:', err.name, err.message);
      if (err.name === 'TokenExpiredError') {
        res.status(401).json({ message: 'Token has expired' });
        return;
      }
      if (err.name === 'JsonWebTokenError') {
        res.status(401).json({ message: 'Invalid token' });
        return;
      }
    }
    console.error('Authentication failed:', err);
    res.status(401).json({ message: 'Authentication failed' });
  }
};

export default verifyToken;