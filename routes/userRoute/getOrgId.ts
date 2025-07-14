import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
const prisma = new PrismaClient();




const getUserOrganizationIdById = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id:userId } = req.user!;
      // Validate input
      if (!userId || typeof userId !== 'number') {
        console.error(`Invalid userId: ${userId}`);
        throw new Error('Valid userId is required');
      }
  
      // Query the user to get organizationId
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });
      console.log(`this is the user ${JSON.stringify(user)}`);
  
      if (!user) {
        console.error(`User not found: userId ${userId}`);
        return null;
      }
  
      return user.organizationId || null;
    } catch (error) {
      console.error(`Error retrieving organizationId for userId` );
      throw error;
    }
  };

export default getUserOrganizationIdById;
