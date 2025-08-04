"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerManualBackup = void 0;
const child_process_1 = require("child_process");
const node_cron_1 = __importDefault(require("node-cron"));
const client_1 = require("@prisma/client");
const util_1 = require("util");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const role_1 = __importDefault(require("../../DatabaseConfig/role"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
const execPromise = (0, util_1.promisify)(child_process_1.exec);
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_NAME = process.env.DB_NAME;
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const RETENTION_DAYS = 7; // Keep backups for 7 days
// Backup the database
const backupDatabase = async () => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path_1.default.join(BACKUP_DIR, `backup-${timestamp}.dump`);
        // Ensure backup directory exists
        try {
            await promises_1.default.stat(BACKUP_DIR);
        }
        catch {
            await promises_1.default.mkdir(BACKUP_DIR, { recursive: true });
            console.log(`Created backup directory: ${BACKUP_DIR}`);
        }
        // Use pg_dump with -Fc for custom format (.dump)
        const backupCommand = `PGPASSWORD="${DB_PASSWORD}" pg_dump -U ${DB_USER} -h ${DB_HOST} -Fc ${DB_NAME} -f ${backupFile}`;
        console.log(`Executing: ${backupCommand.replace(DB_PASSWORD || '', '****')}`); // Mask password
        await execPromise(backupCommand);
        console.log(`Backup created: ${backupFile}`);
        return backupFile;
    }
    catch (error) {
        console.error(`Backup failed: ${error.message}`);
        throw new Error(`Backup process failed: ${error.message}`);
    }
};
// Delete backups older than RETENTION_DAYS
const deleteOldBackups = async () => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
        const files = await promises_1.default.readdir(BACKUP_DIR);
        for (const file of files) {
            const filePath = path_1.default.join(BACKUP_DIR, file);
            const stats = await promises_1.default.stat(filePath);
            if (stats.isFile() && stats.mtime < cutoffDate) {
                await promises_1.default.unlink(filePath);
                console.log(`Deleted old backup: ${filePath}`);
            }
        }
    }
    catch (error) {
        console.error(`Error deleting old backups: ${error.message}`);
        throw new Error(`Error deleting old backups: ${error.message}`);
    }
};
// Run backup and cleanup task
const runTask = async () => {
    try {
        console.log('Starting backup and cleanup task...');
        const backupFile = await backupDatabase();
        await deleteOldBackups();
        // Log to audit log
        console.log('Task completed successfully.');
    }
    catch (error) {
        console.error('Task failed:', error.message);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
};
// API endpoint to trigger manual backup
const triggerManualBackup = async (req, res, next) => {
    try {
        const { tenantId, role } = req.user;
        if (!tenantId) {
            res.status(401).json({ message: 'Unauthorized: Tenant ID is required' });
            return;
        }
        // Authorization check
        if (!role.some((r) => role_1.default[r]?.backup?.create ?? false)) {
            res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
            return;
        }
        const backupFile = await backupDatabase();
        // Log to audit log
        await prisma.auditLog.create({
            data: {
                tenant: { connect: { id: tenantId } },
                user: { connect: { id: req.user.id } },
                action: 'CREATE',
                resource: 'BACKUP',
                details: JSON.stringify({ backupFile, triggeredBy: 'manual' }),
            },
        });
        res.status(200).json({ message: 'Manual backup created successfully', backupFile });
    }
    catch (error) {
        console.error('Manual backup failed:', error.message);
        next(new Error(`Manual backup failed: ${error.message}`));
    }
    finally {
        await prisma.$disconnect();
    }
};
exports.triggerManualBackup = triggerManualBackup;
// Scheduler function
const startBackup = () => {
    if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
        console.error('Missing required environment variables (DB_USER, DB_PASSWORD, DB_NAME). Check your .env file.');
        return;
    }
    node_cron_1.default.schedule('0 0 * * *', () => {
        console.log('Running task at:', new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
        runTask().catch((error) => console.error('Scheduled task failed:', error));
    }, {
        scheduled: true,
        timezone: 'Africa/Nairobi',
    });
    console.log('Scheduler started. Task will run every midnight.');
};
exports.default = startBackup;
