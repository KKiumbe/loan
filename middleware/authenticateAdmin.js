const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cookieParser = require('cookie-parser');

const authenticateAdmin = async (req, res, next) => {
  // Make sure the cookie-parser middleware is being used first in your app
  const token = req.cookies.token;  // Assuming the cookie is named 'token'
  
  if (!token) {
    console.log("No token provided in cookies");
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    // Decode and verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Token decoded:", decoded);  // Log decoded token for debugging

    // Fetch the user from the database
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      console.log("User not found in database");
      return res.status(401).json({ message: "User not found" });
    }

    // Attach user to request object
    req.user = user;

    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({ message: "Authentication required" });
  }
};

module.exports = authenticateAdmin;
