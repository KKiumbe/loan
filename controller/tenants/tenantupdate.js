const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const multer = require('multer');
const path = require('path');

// Set up storage engine for multer to save the uploaded file




// Controller function to handle logo upload
const uploadLogo = async (req, res) => {
  const { tenantId } = req.params; // Extract tenantId from route parameters

  // Check if a file was uploaded
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  try {
    // Construct the logo URL (adjust based on your application's requirements)
    const logoUrl = `/uploads/${req.file.filename}`;  
    // Update the tenant's logo URL in the database
    const updatedTenant = await prisma.tenant.update({
      where: { id: parseInt(tenantId, 10) },
      data: { logoUrl: logoUrl },
    });

    res.status(200).json({
      message: 'Logo uploaded and tenant updated successfully.',
      tenant: updatedTenant,
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ error: 'Failed to upload logo.', details: error.message });
  }
};



// Update Tenant Details (Supports Partial Updates)
const updateTenantDetails = async (req, res) => {
  const { tenantId } = req.params; // Tenant ID from the route parameter
  const updateData = req.body; // Dynamic update fields

  const { role, tenantId: userTenantId, user: userId } = req.user;
  const tenantIdInt = parseInt(tenantId, 10);



  try {
    // Fetch the tenant to ensure it exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantIdInt },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found.' });
    }

    // Ensure the user belongs to the same tenant or has SUPER_ADMIN privileges
    if (userTenantId !== tenantIdInt) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to update this tenant.' });
    }



    // Ensure proper data types for numeric values
    if (updateData.monthlyCharge !== undefined) {
      updateData.monthlyCharge = parseFloat(updateData.monthlyCharge);
    }
    if (updateData.numberOfBags !== undefined) {
      updateData.numberOfBags = parseInt(updateData.numberOfBags, 10);
    }

    // Update the tenant details
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantIdInt },
      data: updateData,
    });

    // Log the changes in the audit log
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_TENANT',
        resource: 'TENANT',
        description: `Updated tenant details for tenant ID ${tenantIdInt}`,
        tenant: {
          connect: { id: tenantIdInt },
        },
        user: {
          connect: { id: userId },
        },
        details: {
          updatedFields: Object.keys(updateData),
        },
      },
    });

    res.status(200).json({
      message: 'Tenant details updated successfully.',
      updatedTenant,
    });
  } catch (error) {
    console.error('Error updating tenant details:', error);
    res.status(500).json({ error: 'Failed to update tenant details.', details: error.message });
  }
};








const fetchTenantDetails = async(tenantID) =>{
   


  try {
    // Fetch the tenant with relationships
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantID },
      select: {
        name: true,
        createdBy: true,
        status: true,
        subscriptionPlan: true,
        monthlyCharge: true,
        paymentDetails:true,
        numberOfBags: true,
        createdAt: true,
        updatedAt: true,
        email: true,
        phoneNumber: true,
        alternativePhoneNumber: true,
        county: true,
        town: true,
        address: true,
        building: true,
        street: true,
        website: true,
        logoUrl: true,
        allowedUsers: true, // Include trash bag issuance
      },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found.' });
    }

 
    //const baseurl = `${req.protocol}://${req.get('host')}`;

    // Build the full URL for logoUrl if it exists
    //const fullLogoUrl = tenant.logoUrl ? `${baseurl}${tenant.logoUrl}` : null;

    // Send the response with the full logo URL
   return tenant
  } catch (error) {
    console.error('Error fetching tenant details:', error);
    res.status(500).json({ error: 'Failed to retrieve tenant details.', details: error.message });
  }
};





const getTenantDetails = async (req, res) => {
  const { tenantId } = req.params; // Extract tenantId from route params
  const tenantIdInt = parseInt(tenantId, 10);

  console.log(`User object: ${JSON.stringify(req.user)}`);
  const { role, tenantId: userTenantId } = req.user;

  try {
    // Fetch the tenant with relationships
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantIdInt },
      select: {
        name: true,
        createdBy: true,
        status: true,
        subscriptionPlan: true,
        monthlyCharge: true,
        paymentDetails:true,
       
        createdAt: true,
        updatedAt: true,
        email: true,
        phoneNumber: true,
        alternativePhoneNumber: true,
        county: true,
        town: true,
        address: true,
        building: true,
        street: true,
        website: true,
        logoUrl: true,
        allowedUsers: true, // Include trash bag issuance
      },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found.' });
    }

    // Ensure user belongs to the same tenant or is a SUPER_ADMIN
    if (userTenantId !== tenantIdInt) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to view this tenant.' });
    }
    const baseurl = `${req.protocol}://${req.get('host')}`;

    // Build the full URL for logoUrl if it exists
    const fullLogoUrl = tenant.logoUrl ? `${baseurl}${tenant.logoUrl}` : null;

    // Send the response with the full logo URL
    res.status(200).json({ 
      tenant: {
        ...tenant,
        logoUrl: fullLogoUrl, // Add the full URL to the response
      } 
    });
  } catch (error) {
    console.error('Error fetching tenant details:', error);
    res.status(500).json({ error: 'Failed to retrieve tenant details.', details: error.message });
  }
};



const fetchTenant = async (tenantId) => {
  try {
    if (!tenantId) throw new Error('Tenant ID is required');

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        createdBy: true,
        status: true,
        subscriptionPlan: true,
        monthlyCharge: true,
       
        paymentDetails: true,
        email: true,
        phoneNumber: true,
        alternativePhoneNumber: true,
       
        allowedUsers: true,
       
      },
    });

    if (!tenant) throw new Error('Tenant not found');

    return tenant; // Now you can destructure anywhere
  } catch (error) {
    console.error('Error fetching tenant details:', error.message);
    throw error; // Re-throw to handle it where it's called
  }
};





module.exports = {
  updateTenantDetails,getTenantDetails,uploadLogo,fetchTenant
};
