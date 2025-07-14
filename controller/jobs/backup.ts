// src/controller/jobs/backup.ts
import { Request, Response, NextFunction } from 'express';
import { exec } from 'child_process';
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import ROLE_PERMISSIONS from '../../DatabaseConfig/role';

dotenv.config();

const prisma = new PrismaClient();
const execPromise = promisify(exec);

const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_NAME = process.env.DB_NAME;
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const RETENTION_DAYS = 7; // Keep backups for 7 days

// Backup the database
const backupDatabase = async (): Promise<string> => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.dump`);

    // Ensure backup directory exists
    try {
      await fs.stat(BACKUP_DIR);
    } catch {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
      console.log(`Created backup directory: ${BACKUP_DIR}`);
    }

    // Use pg_dump with -Fc for custom format (.dump)
    const backupCommand = `PGPASSWORD="${DB_PASSWORD}" pg_dump -U ${DB_USER} -h ${DB_HOST} -Fc ${DB_NAME} -f ${backupFile}`;
    console.log(`Executing: ${backupCommand.replace(DB_PASSWORD || '', '****')}`); // Mask password

    await execPromise(backupCommand);
    console.log(`Backup created: ${backupFile}`);
    return backupFile;
  } catch (error: any) {
    console.error(`Backup failed: ${error.message}`);
    throw new Error(`Backup process failed: ${error.message}`);
  }
};

// Delete backups older than RETENTION_DAYS
const deleteOldBackups = async (): Promise<void> => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    const files = await fs.readdir(BACKUP_DIR);
    for (const file of files) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = await fs.stat(filePath);

      if (stats.isFile() && stats.mtime < cutoffDate) {
        await fs.unlink(filePath);
        console.log(`Deleted old backup: ${filePath}`);
      }
    }
  } catch (error: any) {
    console.error(`Error deleting old backups: ${error.message}`);
    throw new Error(`Error deleting old backups: ${error.message}`);
  }
};

// Run backup and cleanup task
const runTask = async (): Promise<void> => {
  try {
    console.log('Starting backup and cleanup task...');
    const backupFile = await backupDatabase();
    await deleteOldBackups();

    // Log to audit log

    console.log('Task completed successfully.');
  } catch (error: any) {
    console.error('Task failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

// API endpoint to trigger manual backup
export const triggerManualBackup = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { tenantId, role } = req.user!;

    if (!tenantId) {
      res.status(401).json({ message: 'Unauthorized: Tenant ID is required' });
      return;
    }

    // Authorization check
  
if (!role.some((r) => ROLE_PERMISSIONS[r as keyof typeof ROLE_PERMISSIONS]?.backup?.create ?? false)) {
  res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
  return;
}

    const backupFile = await backupDatabase();

    // Log to audit log
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: req.user!.id } },
        action: 'CREATE',
        resource: 'BACKUP',
        details: JSON.stringify({ backupFile, triggeredBy: 'manual' }),
      },
    });

    res.status(200).json({ message: 'Manual backup created successfully', backupFile });
  } catch (error: any) {
    console.error('Manual backup failed:', error.message);
    next(new Error(`Manual backup failed: ${error.message}`));
  } finally {
    await prisma.$disconnect();
  }
};

// Scheduler function
const startBackup = (): void => {
  if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
    console.error('Missing required environment variables (DB_USER, DB_PASSWORD, DB_NAME). Check your .env file.');
    return;
  }

  cron.schedule('0 0 * * *', () => {
    console.log('Running task at:', new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
    runTask().catch((error) => console.error('Scheduled task failed:', error));
  }, {
    scheduled: true,
    timezone: 'Africa/Nairobi',
  });

  console.log('Scheduler started. Task will run every midnight.');
};

export default startBackup;