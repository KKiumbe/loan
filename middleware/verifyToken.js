const jwt = require('jsonwebtoken');

const verifyToken = async (req, res, next) => {
    // Get token from cookies
    const token = req.cookies.token;  // Make sure the token is in the cookies
    
    if (!token) {
        return res.status(401).json({ message: 'Authentication token is required' });
    }

    try {
        // Decode the token to get user data
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Replace with your secret key

        console.log(`this is decoded item ${decoded.role}`);
        
        // Attach the user information to the request object
        req.user = {
            role: decoded.role,
            tenantId: decoded.tenantId,

            id:decoded.id,
            firstName: decoded.firstName,
            lastName: decoded.lastName,
            email: decoded.email,
            phoneNumber: decoded.phoneNumber,
            tenantName: decoded.tenantName,
             // Ensure tenantId is part of the token payload
          };

        // Proceed to the next middleware or route handler
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

module.exports = verifyToken;
