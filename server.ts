// src/server.ts
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import startBackup from './controller/jobs/backup';
import authRoutes from './routes/userRoute/userRoute';
import mpesaRoute from './routes/mpesa/mpesaRoute';
import SMSRoute from './routes/sms/sendSms';
import receiptRoute from './routes/receipt/receiptingRoute';
import paymentRoute from './routes/payment/paymentRoutes';
import statsRoute from './routes/stats/statsRoute';
import uploadcustomers from './routes/fileUpload/uploadRoute';
import smsBalanceRoute from './routes/sms/balance';
import reportsRoute from './routes/reportRoutes/reportRoute';
import userManagementRoute from './routes/rolesRoute/rolesRoute';
import tenantRoute from './routes/tenant/tenantRoute';
import mpesaSettings from './routes/mpesa/mpesaConfig';

import employeeRoute from './routes/employee/employeeRoute';
import loanRoutes from './routes/loan/loanRoute';
import sentSMSRoute from './routes/sms/sentRoute';
import organizationRoute from './routes/organization/orgRoutes';

import loanRepayment from './routes/loanRepayment/repaymentRoute';
import verifyToken from './middleware/verifyToken';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cookieParser());
app.use(bodyParser.json());
app.use(express.json());
app.use(helmet());

app.use(express.json());






const allowedOrigins = [
  'http://localhost:5173',
  'https://localhost',
  'https://lumela.co.ke',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.lumela.co.ke')) {
      callback(null, origin);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS','PATCH'],
}));


// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

// Database connection
async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL database');
  } catch (error) {
    console.error('Error connecting to the database:', error);
    process.exit(1);
  }
}

connectDatabase();

// Public test route (not under /api, so no verifyToken)
app.get('/test', (_req: Request, res: Response) => {
  res.json({ message: 'API is working!' });
});



app.use('/api', authRoutes);


//app.use('/api', verifyToken);

// API Routes (all protected by verifyToken)
app.use('/api', organizationRoute);

app.use('/api', employeeRoute);
app.use('/api', loanRoutes);
app.use('/api', loanRepayment);
app.use('/api', mpesaRoute);
app.use('/api', SMSRoute);
app.use('/api', receiptRoute);
app.use('/api', paymentRoute);
app.use('/api', statsRoute);
app.use('/api', uploadcustomers);
app.use('/api', smsBalanceRoute);
app.use('/api', reportsRoute);
app.use('/api', userManagementRoute);
app.use('/api', mpesaSettings);
app.use('/api', sentSMSRoute);
app.use('/api', tenantRoute);


app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Start scheduled jobs
startBackup();
// startInvoiceGen(); // Uncomment when implemented

// Start the server
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});


// Set server timeout
const timeoutDuration = 800000; // 800 seconds
server.setTimeout(timeoutDuration, () => {
  console.log(`Server timed out after ${timeoutDuration / 1000} seconds.`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing server and database connections...');
  server.close(() => {
    console.log('Server closed.');
    prisma.$disconnect().then(() => {
      console.log('Database disconnected.');
      process.exit(0);
    });
  });
});