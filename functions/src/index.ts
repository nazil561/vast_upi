/**
 * PactPay - Firebase Cloud Functions Entry Point
 * 
 * All financial operations are exposed as callable functions
 * Clients call these functions instead of writing directly to Firestore
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { connectDemoAccount, completeAccountConnection, issueInitialDemoFunds } from './accounts/connectDemoAccount';
import { createPayment, acknowledgePayment, recoverPayment, settlePayment } from './payments/paymentService';

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

interface CallableData {
  data?: any;
  bankId?: string;
  customUpiId?: string;
  recipientIdentifier?: string;
  amount?: number;
  mode?: string;
  description?: string;
  protectionSeconds?: number;
  idempotencyKey?: string;
  paymentId?: string;
}

/**
 * Connect a demo bank account
 */
export const connectAccount = functions.https.onCall(async (data: CallableData, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const requestData = data.data || data;
  const bankId = requestData.bankId;
  const customUpiId = requestData.customUpiId;
  
  if (!bankId) {
    throw new functions.https.HttpsError('invalid-argument', 'bankId is required');
  }
  
  try {
    const userRecord = await admin.auth().getUser(userId);
    const userData = {
      displayName: userRecord.displayName || 'User',
      phoneNumber: userRecord.phoneNumber || '',
    };
    
    const account = await connectDemoAccount(userId, userData, bankId, customUpiId);
    const connectedAccount = await completeAccountConnection(userId, account.userId);
    const issuedAmount = await issueInitialDemoFunds(userId, account.userId);
    
    return {
      success: true,
      data: {
        account: connectedAccount,
        issuedAmount,
      },
    };
  } catch (error: any) {
    console.error('connectAccount error:', error);
    
    if (error.code) {
      throw new functions.https.HttpsError(error.code, error.message);
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Create a payment (NORMAL or PROTECTED)
 */
export const createPaymentFn = functions.https.onCall(async (data: CallableData, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const senderId = context.auth.uid;
  const requestData = data.data || data;
  
  if (!requestData.recipientIdentifier || !requestData.amount || !requestData.mode) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  try {
    const payment = await createPayment(
      senderId,
      requestData.recipientIdentifier,
      requestData.amount,
      requestData.mode as 'NORMAL' | 'PROTECTED',
      requestData.description,
      requestData.protectionSeconds,
      requestData.idempotencyKey
    );
    
    return {
      success: true,
      data: payment,
    };
  } catch (error: any) {
    console.error('createPayment error:', error);
    
    if (error.code) {
      throw new functions.https.HttpsError(error.code, error.message);
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Acknowledge a protected payment
 */
export const acknowledgePaymentFn = functions.https.onCall(async (data: CallableData, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const requestData = data.data || data;
  
  if (!requestData.paymentId) {
    throw new functions.https.HttpsError('invalid-argument', 'paymentId is required');
  }
  
  try {
    const payment = await acknowledgePayment(requestData.paymentId, userId);
    
    return {
      success: true,
      data: payment,
    };
  } catch (error: any) {
    console.error('acknowledgePayment error:', error);
    
    if (error.code) {
      throw new functions.https.HttpsError(error.code, error.message);
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Recover a protected payment
 */
export const recoverPaymentFn = functions.https.onCall(async (data: CallableData, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const requestData = data.data || data;
  
  if (!requestData.paymentId) {
    throw new functions.https.HttpsError('invalid-argument', 'paymentId is required');
  }
  
  try {
    const payment = await recoverPayment(requestData.paymentId, userId, requestData.idempotencyKey);
    
    return {
      success: true,
      data: payment,
    };
  } catch (error: any) {
    console.error('recoverPayment error:', error);
    
    if (error.code) {
      throw new functions.https.HttpsError(error.code, error.message);
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Settle a protected payment
 */
export const settlePaymentFn = functions.https.onCall(async (data: CallableData, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const requestData = data.data || data;
  
  if (!requestData.paymentId) {
    throw new functions.https.HttpsError('invalid-argument', 'paymentId is required');
  }
  
  try {
    const payment = await settlePayment(requestData.paymentId, userId, requestData.idempotencyKey);
    
    return {
      success: true,
      data: payment,
    };
  } catch (error: any) {
    console.error('settlePayment error:', error);
    
    if (error.code) {
      throw new functions.https.HttpsError(error.code, error.message);
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Scheduled function to process expired payments
 * Runs every minute
 */
export const processExpiredPayments = functions.pubsub.schedule('every 1 minutes').onRun(async () => {
  const now = admin.firestore.Timestamp.now();
  
  const expiredPayments = await db.collection('payments')
    .where('status', '==', 'PROTECTED')
    .where('expiresAt', '<=', now)
    .limit(100)
    .get();
  
  if (expiredPayments.empty) {
    console.log('No expired payments to process');
    return null;
  }
  
  console.log(`Processing ${expiredPayments.size} expired payments`);
  
  const results = [];
  
  for (const doc of expiredPayments.docs) {
    try {
      const payment = doc.data();
      
      await db.runTransaction(async (transaction) => {
        const freshDoc = await transaction.get(doc.ref);
        const freshPayment = freshDoc.data() as any;
        
        if (freshPayment.status !== 'PROTECTED') {
          console.log(`Payment ${doc.id} already in state ${freshPayment.status}, skipping`);
          return;
        }
        
        transaction.update(doc.ref, {
          status: 'EXPIRED',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        const senderWalletRef = db.collection('wallets').doc(payment.senderUserId);
        const recipientWalletRef = db.collection('wallets').doc(payment.recipientUserId);
        
        const [senderWallet, recipientWallet] = await Promise.all([
          transaction.get(senderWalletRef),
          transaction.get(recipientWalletRef),
        ]);
        
        if (!senderWallet.exists || !recipientWallet.exists) {
          throw new Error('Wallet not found');
        }
        
        const senderData = senderWallet.data()!;
        const recipientData = recipientWallet.data()!;
        
        if (senderData.protectedOutgoing < payment.amount) {
          throw new Error('Insufficient protected outgoing');
        }
        
        if (recipientData.protectedIncoming < payment.amount) {
          throw new Error('Insufficient protected incoming');
        }
        
        transaction.update(senderWalletRef, {
          protectedOutgoing: senderData.protectedOutgoing - payment.amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        transaction.update(recipientWalletRef, {
          availableBalance: recipientData.availableBalance + payment.amount,
          protectedIncoming: recipientData.protectedIncoming - payment.amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        transaction.update(doc.ref, {
          status: 'SETTLED',
          settlementMethod: 'AUTO_EXPIRY',
          settledAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      
      results.push({ paymentId: doc.id, success: true });
    } catch (error: any) {
      console.error(`Error processing payment ${doc.id}:`, error);
      results.push({ paymentId: doc.id, success: false, error: error.message });
    }
  }
  
  return { processed: results.length, results };
});
