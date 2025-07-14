


// 1. Define the expected shape of the request body
export interface RegisterRequestBody {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  county?: string;
  town?: string;
  gender?: string;
  password: string;
  tenantName: string;
}

export // Define the expected request body shape
interface SignInRequestBody {
  phoneNumber: string;
  password: string;
}



// Define the expected request body shape
export interface SignInRequestBody {
  phoneNumber: string;
  password: string;
}



   export interface NewTenant {
      id: string;
      name: string;
      subscriptionPlan: string;
      monthlyCharge: number;
      status: string;
    }

   export interface NewUser {
      id: string;
      firstName: string;
      lastName: string;
      phoneNumber: string;
      email: string;
      county: string | null;
      town: string | null;
      gender: string | null;
      password: string;
      tenantName: string;
      role: string[];
      tenantId: string;
      lastLogin: Date;
      loginCount: number;
      status: string;
    }

   export interface TransactionResult {
      user: NewUser;
      tenant: NewTenant;
    }
