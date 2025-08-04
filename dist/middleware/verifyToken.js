"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = require("jsonwebtoken");
const verifyToken = (req, res, next) => {
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
        const decoded = (0, jsonwebtoken_1.verify)(token, process.env.JWT_SECRET);
        console.log('Token verified, user:', decoded);
        req.user = decoded;
        next();
    }
    catch (err) {
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
exports.default = verifyToken;
