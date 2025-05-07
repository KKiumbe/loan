

const schedule = require('node-schedule');
const { generateInvoicesforAll } = require('../bill/billGenerator.js');

// Schedule the job to run at the start of each month
const invoiceJob = schedule.scheduleJob('0 0 1 * *', async () => {
  try {
    console.log('Generating invoices...');
    await generateInvoicesforAll();
    console.log('Invoices generated successfully.');
  } catch (error) {
    console.error('Error generating invoices:', error);
  }
});

module.exports = invoiceJob;



