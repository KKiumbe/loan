const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Run every 20 minutes





cron.schedule('0 0 * * 0', async () => {
    console.log('🔄 Running weekly job: Resetting collected status...');
    try {
        await prisma.customer.updateMany({
            data: { collected: false },
        });
        console.log('✅ Successfully updated collected status for all customers.');
    } catch (error) {
        console.error('❌ Error updating collected status:', error);
    }
});

// Reset `trashBagsIssued` status on the 1st of every month at midnight
cron.schedule('0 0 1 * *', async () => {
    console.log('🗑️ Running monthly job: Resetting trashBagsIssued status...');
    try {
        await prisma.customer.updateMany({
            data: { trashBagsIssued: false },
        });
        console.log('✅ Successfully updated trashBagsIssued status for all customers.');
    } catch (error) {
        console.error('❌ Error updating trashBagsIssued status:', error);
    }
});

module.exports = {};
