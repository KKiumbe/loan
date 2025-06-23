const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();

async function updateEmptyOriginatorConversationIDs() {
  try {
    console.log('Starting cleanup of empty or NULL originatorConversationID values...');

 const rows = await prisma.mPesaBalance.findMany({
  where: {
    originatorConversationID: ''
  },
  select: {
    id: true,
    originatorConversationID: true,
    conversationID: true,
    transactionID: true,
    tenantId: true,
    resultCode: true,
    resultDesc: true
  }
});




    console.log(`Found ${rows.length} rows with empty or NULL originatorConversationID:`);
    console.log(JSON.stringify(rows, null, 2));

    if (rows.length === 0) {
      console.log('No rows to update. Exiting.');
      return;
    }

    for (const row of rows) {
      const newUUID = uuidv4();
      await prisma.mPesaBalance.update({
        where: { id: row.id },
        data: { originatorConversationID: newUUID },
      });
      console.log(`Updated row ${row.id} with UUID: ${newUUID}`);
    }

    console.log('Cleanup complete');
  } catch (error) {
    console.error('Error updating rows:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateEmptyOriginatorConversationIDs();