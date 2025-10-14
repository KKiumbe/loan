import express, { Request, Response, NextFunction } from "express";

const allowedIPs = [
  "196.201.214.200",
  "196.201.214.206",
  "196.201.213.114",
  "196.201.214.207",
  "196.201.214.208",
  "196.201.213.44",
  "196.201.212.127",
  "196.201.212.138",
  "196.201.212.129",
  "196.201.212.136",
  "196.201.212.74",
  "196.201.212.69",
];

export const  verifyIP = (req: Request, res: Response, next: NextFunction) => {
  const requestIP =
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket.remoteAddress;

  console.log("Incoming IP:", requestIP);

  // Handle IPv6-mapped IPv4 addresses (e.g., "::ffff:196.201.214.200")
  const normalizedIP = requestIP?.replace("::ffff:", "");

  if (!normalizedIP || !allowedIPs.includes(normalizedIP)) {
    console.warn(`❌ Blocked unauthorized IP: ${normalizedIP}`);
    return res.status(403).json({ message: "Access denied" });
  }

  next();
};