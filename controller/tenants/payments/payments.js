async function processTenantPayment(tenantId, amount, modeOfPayment, transactionId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { tenantInvoices: true },
    });
  
    const unpaidInvoices = tenant.tenantInvoices.filter((inv) => inv.status === 'UNPAID');
    if (unpaidInvoices.length === 0) return;
  
    // Apply payment to the oldest unpaid invoice
    const oldestInvoice = unpaidInvoices[0];
    const newAmountPaid = oldestInvoice.amountPaid + amount;
  
    await prisma.tenantPayment.create({
      data: {
        tenantInvoiceId: oldestInvoice.id,
        tenantId,
        amount,
        modeOfPayment,
        transactionId,
      },
    });
  
    if (newAmountPaid >= oldestInvoice.invoiceAmount) {
      await prisma.tenantInvoice.update({
        where: { id: oldestInvoice.id },
        data: {
          status: 'PAID',
          amountPaid: oldestInvoice.invoiceAmount,
        },
      });
    } else {
      await prisma.tenantInvoice.update({
        where: { id: oldestInvoice.id },
        data: { amountPaid: newAmountPaid },
      });
    }
  
    // Check if all invoices are paid to reactivate
    const allPaid = tenant.tenantInvoices.every((inv) => inv.status === 'PAID');
    if (allPaid && tenant.status === 'DISABLED') {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: 'ACTIVE' },
      });
      await prisma.notification.create({
        data: {
          tenantId,
          userId: tenant.createdBy,
          message: 'Your account has been reactivated after clearing all invoices.',
          type: 'ALERT',
        },
      });
    }
  }
  
  // Example usage
  processTenantPayment(1, 5000, 'MPESA', 'MPESA123456');