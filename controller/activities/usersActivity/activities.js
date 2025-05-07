const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getUserLoginStats() {
  return await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      lastLogin: true,  // Fetch directly from the DB
      loginCount: true  // Fetch directly from the DB
    }
  });
}

module.exports = { getUserLoginStats };
