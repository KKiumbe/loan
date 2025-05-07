const { PrismaClient, ModeOfPayment } = require('@prisma/client');
const { sendSMS } = require('../sms/sms');

const prisma = new PrismaClient();

// function generateReceiptNumber() {
//   const randomDigits = Math.floor(10000 + Math.random() * 90000);
//   return `RCPT${randomDigits}`;
// }

function generateTransactionId() {
  const randomDigits = Math.floor(10000000 + Math.random() * 90000000);
  return `C${randomDigits}`;
}

const manualCashPayment = async (req, res) => {
  const { customerId, totalAmount, modeOfPayment, paidBy, paymentId } = req.body;
  const { tenantId } = req.user;

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required to make payments.' });
  }

  if (!customerId || !totalAmount || !modeOfPayment || !paidBy) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  if (!Object.values(ModeOfPayment).includes(modeOfPayment)) {
    return res.status(400).json({
      message: `Invalid mode of payment. Valid options are: ${Object.values(ModeOfPayment).join(', ')}`,
    });
  }

  try {
    // Fetch customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      select: { phoneNumber: true, firstName: true, closingBalance: true },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    const transactionId = generateTransactionId();
    const receipts = [];
    const updatedInvoices = [];
   


    let finalClosingBalance = customer.closingBalance - totalAmount; 

    // Update or create payment record
    let updatedPayment;
    if (paymentId) {
      updatedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          amount: totalAmount,
          tenantId,
          modeOfPayment,
          transactionId: transactionId,
          receipted: true,
          createdAt: new Date(),
        },
      });
    } else {
      updatedPayment = await prisma.payment.create({
        data: {
          amount: totalAmount,
          tenantId,
          modeOfPayment,
          transactionId: transactionId,
          receipted: true,
          createdAt: new Date(),
        },
      });
    }

    // Fetch unpaid or partially paid invoices
    const invoices = await prisma.invoice.findMany({
      where: { customerId, status: { in: ['UNPAID', 'PPAID'] } },
      orderBy: { createdAt: 'asc' },
    });

    // Use transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
      if (invoices.length === 0) {
        // No invoices: Just update closing balance
        await tx.customer.update({
          where: { id: customerId },
          data: { closingBalance: finalClosingBalance },
        });
        receipts.push({ invoiceId: null });
      } else {
        // Process invoices with available funds from overpayment
        let remainingFunds = totalAmount;
        for (const invoice of invoices) {
          if (remainingFunds <= 0) break;

          const invoiceDueAmount = invoice.invoiceAmount - invoice.amountPaid;
          const paymentForInvoice = Math.min(remainingFunds, invoiceDueAmount);

          const updatedInvoice = await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              amountPaid: invoice.amountPaid + paymentForInvoice,
              status: invoice.amountPaid + paymentForInvoice >= invoice.invoiceAmount ? 'PAID' : 'PPAID',
              closingBalance: invoice.closingBalance - paymentForInvoice, // Reflect payment in invoice balance
            },
          });

          updatedInvoices.push(updatedInvoice);
          receipts.push({ invoiceId: updatedInvoice.id });
          remainingFunds -= paymentForInvoice;
        }

        // Update customer closing balance (already reduced by totalAmount, adjusted by invoices)
        finalClosingBalance = customer.closingBalance - totalAmount;

        await tx.customer.update({
          where: { id: customerId },
          data: { closingBalance: finalClosingBalance },
        });

        if (remainingFunds > 0) {
          receipts.push({
            invoiceId: null,
            description: `Remaining KES ${remainingFunds} as overpayment`,
          });
        }
      }
    });


   
 

    const balanceMessage = finalClosingBalance < 0
      ? `an overpayment of KES ${Math.abs(finalClosingBalance)}`
      : `KES ${finalClosingBalance}`;
    const text = `Dear ${customer.firstName}, payment of KES ${totalAmount} received successfully. ` +
      `Your balance is ${balanceMessage}. Thank you.`;

    await sendSMS(tenantId, customer.phoneNumber, text);

    res.status(201).json({
      message: 'Payment and receipt created successfully, SMS notification sent.',
      receipt: receipts,
      updatedPayment,
      updatedInvoices,
      newClosingBalance: finalClosingBalance,
      paymentId: updatedPayment.id,
    });
  } catch (error) {
    console.error('Error creating manual cash payment:', error);
    res.status(500).json({ error: 'Failed to create manual cash payment.', details: error.message });
  }
};

module.exports = { manualCashPayment };