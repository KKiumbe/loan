const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const  {settleInvoice}  = require('../../controller/mpesa/paymentSettlement.js');

// Route to handle M-Pesa callback notifications
router.post('/callback', async (req, res) => {
  const paymentData = req.body; // M-Pesa sends the payment details in the body
 
  if (!paymentData) {
    return res.status(400).json({ message: 'No payment data received' });
  }

  const paymentInfo = {
    ShortCode: paymentData.BusinessShortCode,
    TransID: paymentData.TransID,
    TransTime: parseTransTime(paymentData.TransTime),
    TransAmount: parseFloat(paymentData.TransAmount),
    ref: paymentData.BillRefNumber,
    phone: paymentData.MSISDN,
    FirstName: paymentData.FirstName,
  };

  // Log the payment info
  console.log('Payment Notification Received:', paymentInfo);

  try {
    // Check if the transaction already exists
    const existingTransaction = await prisma.mPESATransactions.findUnique({
      where: { TransID: paymentInfo.TransID },
    });

    if (existingTransaction) {
      console.log(`Transaction with ID ${paymentInfo.TransID} already exists. Skipping save.`);
      return res
        .status(409)
        .json({ message: 'Transaction already processed.', transactionId: paymentInfo.TransID });
    }

    // Fetch the tenant ID using the ShortCode
    const mpesaConfig = await prisma.mPESAConfig.findUnique({
      where: { shortCode: paymentInfo.ShortCode },
    });

    if (!mpesaConfig) {
      console.error(`No tenant found for ShortCode: ${paymentInfo.ShortCode}`);
      return res
        .status(404)
        .json({ message: `No tenant configuration found for ShortCode ${paymentInfo.ShortCode}` });
    }

    const tenantId = mpesaConfig.tenantId;

    // Save the payment transaction to the database
    const transaction = await prisma.mPESATransactions.create({
      data: {
        TransID: paymentInfo.TransID,
        TransTime: paymentInfo.TransTime,
        ShortCode: paymentInfo.ShortCode,
        TransAmount: paymentInfo.TransAmount,
        BillRefNumber: paymentInfo.ref,
        MSISDN: paymentInfo.phone,
        FirstName: paymentInfo.FirstName,
        tenantId: tenantId,
        processed: false, // Set to false initially to indicate unprocessed transaction
      },
    });

    console.log('Payment info saved to the database:', transaction);

  

    // Trigger invoice settlement process
    await settleInvoice(); // Ensure settleInvoice is correctly implemented to process invoices

    // Respond with a success message
    res.status(200).json({ message: 'Payment processed successfully.' });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ message: 'Error processing payment.', error: error.message });
  }
});

// Function to parse TransTime
function parseTransTime(transTime) {
  const year = parseInt(transTime.slice(0, 4), 10);
  const month = parseInt(transTime.slice(4, 6), 10) - 1; // Months are 0-indexed
  const day = parseInt(transTime.slice(6, 8), 10);
  const hours = parseInt(transTime.slice(8, 10), 10);
  const minutes = parseInt(transTime.slice(10, 12), 10);
  const seconds = parseInt(transTime.slice(12, 14), 10);

  return new Date(year, month, day, hours, minutes, seconds);
}

// Route to handle Lipa Na M-Pesa requests

module.exports = router;
