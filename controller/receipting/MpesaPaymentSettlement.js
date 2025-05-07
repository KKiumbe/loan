const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const axios = require('axios');

const { sendSMS } = require('../sms/sms');









async function generateReceiptNumber()  {
    let receiptNumber;
    let exists = true;

   

    while (exists) {
        const randomDigits = Math.floor(1000000 + Math.random() * 9000000);
        receiptNumber = `RCPT${randomDigits}`; // Append the tenant ID
        exists = await prisma.receipt.findUnique({
            where: { receiptNumber },
        }) !== null;
    }

    return receiptNumber;
}



const MpesaPaymentSettlement = async (req, res) => {
    const { customerId, modeOfPayment, paidBy, paymentId } = req.body;
    const { tenantId } = req.user;
  
    if (!customerId || !modeOfPayment || !paidBy || !paymentId) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
  
    try {
      // Retrieve customer data
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, closingBalance: true, phoneNumber: true, firstName: true, tenantId: true },
      });
  
      if (!customer || customer.tenantId !== tenantId) {
        return res.status(404).json({ message: 'Customer not found or does not belong to this tenant.' });
      }
  
      // Retrieve the payment amount
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { amount: true, receipted: true, tenantId: true },
      });
  
      if (!payment || payment.tenantId !== tenantId) {
        return res.status(404).json({ message: 'Payment not found or does not belong to this tenant.' });
      }
  
      if (payment.receipted) {
        return res.status(400).json({ message: 'Payment with this ID has already been receipted.' });
      }
  
      const totalAmount = payment.amount;
  
      // Mark the payment as receipted
      await prisma.payment.update({
        where: { id: paymentId },
        data: { receipted: true },
      });
  
      // Get unpaid or partially paid invoices for the customer
      const invoices = await prisma.invoice.findMany({
        where: {
          customerId,
          tenantId,
          OR: [{ status: 'UNPAID' }, { status: 'PPAID' }],
        },
        orderBy: { createdAt: 'asc' },
      });
  
      let remainingAmount = totalAmount;
      const receipts = [];
      const updatedInvoices = [];
  
      // Process payment if there are unpaid or partially paid invoices
      for (const invoice of invoices) {
        if (remainingAmount <= 0) break;
  
        const invoiceDue = invoice.invoiceAmount - invoice.amountPaid;
        const paymentForInvoice = Math.min(remainingAmount, invoiceDue);
  
        const newAmountPaid = invoice.amountPaid + paymentForInvoice;
        const newStatus = newAmountPaid >= invoice.invoiceAmount ? 'PAID' : 'PPAID';
  
        const updatedInvoice = await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: newAmountPaid,
            status: newStatus,
          },
        });
        updatedInvoices.push(updatedInvoice);
  
        const receiptNumber = await generateReceiptNumber();
        const receipt = await prisma.receipt.create({
          data: {
            customerId,
            amount: paymentForInvoice,
            modeOfPayment,
            receiptNumber,
            paymentId,
            paidBy,
            createdAt: new Date(),
            tenantId,
          },
        });
        receipts.push(receipt);
        remainingAmount -= paymentForInvoice;
      }
  
      // Handle overpayment
      if (remainingAmount > 0) {
        const overpaymentReceiptNumber =  await generateReceiptNumber();
        const overpaymentReceipt = await prisma.receipt.create({
          data: {
            customerId,
            amount: remainingAmount,
            modeOfPayment,
            receiptNumber: overpaymentReceiptNumber,
            paymentId,
            paidBy,
            createdAt: new Date(),
            tenantId,
          },
        });
        receipts.push(overpaymentReceipt);
      }
  
      const finalClosingBalance = customer.closingBalance - totalAmount;
  
      // Update customer's closing balance
      await prisma.customer.update({
        where: { id: customerId },
        data: { closingBalance: finalClosingBalance },
      });
  
      // Response with details
      res.status(201).json({
        message: 'Payment processed successfully.',
        receipts,
        updatedInvoices,
        newClosingBalance: finalClosingBalance,
      });
  
      // Send confirmation SMS
      const balanceMessage =
        finalClosingBalance < 0
          ? `Your closing balance is an overpayment of KES ${Math.abs(finalClosingBalance)}`
          : `Your closing balance is KES ${finalClosingBalance}`;
      const message = `Dear ${customer.firstName}, payment of KES ${totalAmount} for garbage collection services received successfully. ${balanceMessage}. Always use your phone number as the account number, Thank you!`;
  
      await sendSMS(tenantId, customer.phoneNumber, message);
    } catch (error) {
      console.error('Error processing payment:', error);
      res.status(500).json({ error: 'Failed to process payment.', details: error.message });
    }
  };
  


module.exports = { MpesaPaymentSettlement };
