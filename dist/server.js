"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
const backup_1 = __importDefault(require("./controller/jobs/backup"));
const userRoute_1 = __importDefault(require("./routes/userRoute/userRoute"));
const mpesaRoute_1 = __importDefault(require("./routes/mpesa/mpesaRoute"));
const sendSms_1 = __importDefault(require("./routes/sms/sendSms"));
const receiptingRoute_1 = __importDefault(require("./routes/receipt/receiptingRoute"));
const paymentRoutes_1 = __importDefault(require("./routes/payment/paymentRoutes"));
const statsRoute_1 = __importDefault(require("./routes/stats/statsRoute"));
const uploadRoute_1 = __importDefault(require("./routes/fileUpload/uploadRoute"));
const balance_1 = __importDefault(require("./routes/sms/balance"));
const reportRoute_1 = __importDefault(require("./routes/reportRoutes/reportRoute"));
const rolesRoute_1 = __importDefault(require("./routes/rolesRoute/rolesRoute"));
const tenantRoute_1 = __importDefault(require("./routes/tenant/tenantRoute"));
const mpesaConfig_1 = __importDefault(require("./routes/mpesa/mpesaConfig"));
const employeeRoute_1 = __importDefault(require("./routes/employee/employeeRoute"));
const loanRoute_1 = __importDefault(require("./routes/loan/loanRoute"));
const sentRoute_1 = __importDefault(require("./routes/sms/sentRoute"));
const orgRoutes_1 = __importDefault(require("./routes/organization/orgRoutes"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cookie_parser_1.default)());
app.use(body_parser_1.default.json());
app.use(express_1.default.json());
app.use((0, helmet_1.default)());
app.use(express_1.default.json());
const allowedOrigins = [
    'http://localhost:5173',
    'https://localhost',
    'https://lumela.co.ke',
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        console.log('Request Origin:', origin);
        if (!origin || // allow same-origin or tools like Postman
            allowedOrigins.includes(origin) ||
            origin.endsWith('.lumela.co.ke')) {
            callback(null, origin); // ✅ Return the actual origin
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
// Static file serving
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, 'Uploads')));
// Database connection
async function connectDatabase() {
    try {
        await prisma.$connect();
        console.log('Connected to PostgreSQL database');
    }
    catch (error) {
        console.error('Error connecting to the database:', error);
        process.exit(1);
    }
}
connectDatabase();
// Public test route (not under /api, so no verifyToken)
app.get('/test', (_req, res) => {
    res.json({ message: 'API is working!' });
});
app.use('/api', userRoute_1.default);
//app.use('/api', verifyToken);
// API Routes (all protected by verifyToken)
app.use('/api', orgRoutes_1.default);
app.use('/api', employeeRoute_1.default);
app.use('/api', loanRoute_1.default);
app.use('/api', mpesaRoute_1.default);
app.use('/api', sendSms_1.default);
app.use('/api', receiptingRoute_1.default);
app.use('/api', paymentRoutes_1.default);
app.use('/api', statsRoute_1.default);
app.use('/api', uploadRoute_1.default);
app.use('/api', balance_1.default);
app.use('/api', reportRoute_1.default);
app.use('/api', rolesRoute_1.default);
app.use('/api', mpesaConfig_1.default);
app.use('/api', sentRoute_1.default);
app.use('/api', tenantRoute_1.default);
app.use((err, _req, res, _next) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});
// Start scheduled jobs
(0, backup_1.default)();
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
