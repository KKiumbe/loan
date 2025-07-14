import express from 'express';
import verifyToken from '../../middleware/verifyToken';
import checkAccess from '../../middleware/roleVerify';
import { sendToOne } from '../../controller/sms/sms';
import { createSMSConfig, updateSMSConfig } from '../../controller/smsConfig/smsConfig';









const router = express.Router();



//SMS routes for sending bulk sms
//router.post('/send-to-all', verifyToken, checkAccess('customer', 'read'), sendToAll);//done




//router.post('/send-to-group', verifyToken, checkAccess('customer', 'read'), sendToGroup); //done sending bulk sms to all tenants of a landlord or building
router.post('/send-sms', verifyToken, checkAccess('customer', 'read'), sendToOne ); //done


//SMS CONFIGURATION
router.put('/sms-config-update',verifyToken, updateSMSConfig);  //done
router.post('/sms-config',verifyToken, createSMSConfig);  //done





//SMS for debt collection


//route for fetching SMS records

// router.get('/sms-delivery-report' ,updateSmsDeliveryStatus);
// router.get('/sms-history',verifyToken, getSmsMessages);
// //router.post('/auto-sms' , sendSMS)

export default router;