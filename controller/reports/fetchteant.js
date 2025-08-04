
const { PrismaClient, LoanStatus } = require("@prisma/client");


const prisma = new PrismaClient();
const fetchTenant = async (tenantId) => {
  try {
    if (!tenantId) throw new Error('Tenant ID is required');

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
       // createdBy: true,
        status: true,
        subscriptionPlan: true,
        monthlyCharge: true,
       // numberOfBags: true,
        //paymentDetails: true,
        email: true,
        street: true,
        building: true,
        address: true,
        county: true,
        town: true,
        website: true,
       
        phoneNumber: true,
        alternativePhoneNumber: true,
       
        //allowedUsers: true,
        //logoUrl:true
        
       
       
      },
    });

    if (!tenant) throw new Error('Tenant not found');

    return tenant; // Now you can destructure anywhere
  } catch (error) {
    console.error('Error fetching tenant details:', error.message);
    throw error; // Re-throw to handle it where it's called
  }
};

module.exports = {fetchTenant};