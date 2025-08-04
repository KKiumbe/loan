import { PrismaClient, Tenant } from '@prisma/client';

const prisma = new PrismaClient();

// Define the subset of Tenant fields returned (since you're using `select`)
export interface TenantDetails {
  id: number;
  name: string;
  status: string;
  subscriptionPlan: string | null;
  monthlyCharge: number | null;
  email: string | null;
  street: string | null;
  building: string | null;
  address: string | null;
  county: string | null;
  town: string | null;
  website: string | null;
  phoneNumber: string | null;
  alternativePhoneNumber: string | null;
  logoUrl?: string; // Uncomment if needed
}

export const fetchTenant = async (tenantId: number): Promise<TenantDetails> => {
  try {
    if (!tenantId) throw new Error('Tenant ID is required');

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        subscriptionPlan: true,
        monthlyCharge: true,
        email: true,
        street: true,
        building: true,
        address: true,
        county: true,
        town: true,
        website: true,
        phoneNumber: true,
        alternativePhoneNumber: true,
      },
    });

    if (!tenant) throw new Error('Tenant not found');

    return tenant;
  } catch (error: any) {
    console.error('Error fetching tenant details:', error.message);
    throw error;
  }
};
