export interface Tenant {
  name?: string;
  street?: string;
  phoneNumber?: string;
  email?: string;
  county?: string;
  town?: string;
  address?: string;
  building?: string;
  logoUrl?: string;
}

export type ContentItem = {
  text?: string;
  fontSize?: number;
  rect?: any;
};