const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();

async function updateEmptyOriginatorConversationIDs() {
  try {
    const rows = await prisma.mPesaBalance.findMany({
      where: {
        OR: [
          { originatorConversationID: '' },
          { originatorConversationID: null },
        ],
      },
    });

    console.log(`Found ${rows.length} rows to update`);

    for (const row of rows) {
      const newUUID = uuidv4();
      await prisma.mPesaBalance.update({
        where: { id: row.id },
        data: { originatorConversationID: newUUID },
      });
      console.log(`Updated row ${row.id} with UUID: ${newUUID}`);
    }

    console.log('Update complete');
  } catch (error) {
    console.error('Error updating rows:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateEmptyOriginatorConversationIDs();