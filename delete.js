import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Delete audit logs where user has null organizationId
  const auditDeleted = await prisma.auditLog.deleteMany({
    where: {
      user: { organizationId: null }
    },
  });
  console.log(`🧾 Deleted ${auditDeleted.count} audit logs`);

  // Now delete the users
  const userDeleted = await prisma.user.deleteMany({
    where: { organizationId: null },
  });
  console.log(`🗑️ Deleted ${userDeleted.count} users`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
