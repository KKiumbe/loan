const express = require('express');
const router = express.Router();
const { lipaNaMpesa } = require('../mpesa/payment.js');
const prisma = require('../../prismaClient'); // Adjust the import based on your setup
const { settleInvoice } = require('../mpesa/paymentSettlement.js');

router.post('/callback', async (req, res) => {
    const paymentData = req.body; // M-Pesa sends the payment details in the body

    if (!paymentData) {
        return res.status(400).json({ message: 'No payment data received' });
    }

    const paymentInfo = {
        TransID: paymentData.TransID,
        TransTime: parseTransTime(paymentData.TransTime),
        TransAmount: paymentData.TransAmount.toString(),
        ref: paymentData.BillRefNumber,
        phone: paymentData.MSISDN,
        FirstName: paymentData.FirstName
    };

    // Log the payment info
    console.log('Payment Notification Received:', paymentInfo);

    try {
        // Save the payment transaction
        const transaction = await prisma.mpesaTransaction.create({
            data: {
                TransID: paymentInfo.TransID,
                TransTime: paymentInfo.TransTime,
                TransAmount: paymentInfo.TransAmount,
                BillRefNumber: paymentInfo.ref,
                MSISDN: paymentInfo.phone,
                FirstName: paymentInfo.FirstName,
            },
        });

        console.log('Payment info saved to the database.');

        // Settle invoice if there's a match
        const customer = await prisma.customer.findFirst({
            where: { phoneNumber: paymentInfo.ref },
        });

        if (customer) {
            // Automatically settle the invoice
            await settleInvoice();
            console.log(`Invoice for customer ${customer.phone} settled.`);
        } else {
            // Handle manual matching process
            console.log(`No matching customer found for BillRefNumber: ${paymentInfo.ref}.`);
            // Here you could implement logic to notify an admin or record for manual matching
        }

        res.status(200).json({ message: 'Payment processed successfully.' });
    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({ error: 'Failed to process payment.' });
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
router.post('/lipa', lipaNaMpesa); // Use the controller function

module.exports = router;
