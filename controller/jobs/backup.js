require('dotenv').config();
const { exec } = require('child_process');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs').promises;
const path = require('path');

const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_NAME = process.env.DB_NAME;
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const RETENTION_DAYS = 7; // Keep backups for 7 days

const backupDatabase = async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `${BACKUP_DIR}/backup-${timestamp}.dump`;

    // Ensure backup directory exists
    if (!(await fs.stat(BACKUP_DIR).catch(() => false))) {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
      console.log(`Created backup directory: ${BACKUP_DIR}`);
    }

    // Use pg_dump with -Fc for custom format (.dump)
    const backupCommand = `PGPASSWORD="${DB_PASSWORD}" pg_dump -U ${DB_USER} -h ${DB_HOST} -Fc ${DB_NAME} -f ${backupFile}`;
    console.log(`Executing: ${backupCommand.replace(DB_PASSWORD, '****')}`); // Mask password in logs

    await new Promise((resolve, reject) => {
      exec(backupCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`Backup failed: ${stderr || error.message}`);
          reject(error);
        } else {
          console.log(`Backup created: ${backupFile}`);
          resolve(backupFile);
        }
      });
    });
    return backupFile;
  } catch (error) {
    throw new Error(`Backup process failed: ${error.message}`);
  }
};

const deleteOldBackups = async () => {
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
  } catch (error) {
    console.error(`Error deleting old backups: ${error.message}`);
    throw error;
  }
};

const runTask = async () => {
  try {
    console.log('Starting backup and cleanup task...');
    await backupDatabase();
    await deleteOldBackups();
    console.log('Task completed successfully.');
  } catch (error) {
    console.error('Task failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = () => {
  if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
    console.error('Missing required environment variables (DB_USER, DB_PASSWORD, DB_NAME). Check your .env file.');
    return;
  }

  cron.schedule('0 0 * * *', () => {
    console.log('Running task at:', new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }));
    runTask();
  }, {
    scheduled: true,
    timezone: 'Africa/Nairobi'
  });
  console.log('Scheduler started. Task will run every midnight.');
};