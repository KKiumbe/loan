const express = require('express');

const { sendBills, sendToAll, sendBill, sendToGroup, sendToOne, sendUnpaidCustomers, sendCustomersAboveBalance, sendBillPerLandlordOrBuilding, sendCustomSmsAboveBalance } = require('../../controller/sms/sms.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { updateSMSConfig, createSMSConfig } = require('../../controller/smsConfig/smsConfig.js');
const verifyToken = require('../../middleware/verifyToken.js');







const router = express.Router();

// SMS Routes for sending bills
router.post('/send-bills', verifyToken, checkAccess('customer', 'read'), sendBills);//done
router.post('/send-bill-per-landlord-or-building', verifyToken, checkAccess('customer', 'read'), sendBillPerLandlordOrBuilding); //done
router.post('/send-bill', verifyToken, checkAccess('customer', 'read'), sendBill);//done sending to one customer
router.post('/send-sms-unpaid' ,verifyToken , sendUnpaidCustomers); //done


//SMS routes for sending bulk sms
router.post('/send-to-all', verifyToken, checkAccess('customer', 'read'), sendToAll);//done




router.post('/send-to-group', verifyToken, checkAccess('customer', 'read'), sendToGroup); //done sending bulk sms to all tenants of a landlord or building
router.post('/send-sms', verifyToken, checkAccess('customer', 'read'), sendToOne ); //done


//SMS CONFIGURATION
router.put('/sms-config-update',verifyToken, updateSMSConfig);  //done
router.post('/sms-config',verifyToken, createSMSConfig);  //done





//SMS for debt collection
router.post('/send-sms-custom-balance',verifyToken, sendCustomersAboveBalance);

router.post('/send-custom-sms-above-balance',verifyToken, sendCustomSmsAboveBalance);

//route for fetching SMS records

// router.get('/sms-delivery-report' ,updateSmsDeliveryStatus);
// router.get('/sms-history',verifyToken, getSmsMessages);
// //router.post('/auto-sms' , sendSMS)

module.exports = router;