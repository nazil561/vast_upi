"use strict";
/**
 * PactPay - Firebase Cloud Functions Entry Point
 *
 * All financial operations are exposed as callable functions
 * Clients call these functions instead of writing directly to Firestore
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processExpiredPayments = exports.settlePaymentFn = exports.recoverPaymentFn = exports.acknowledgePaymentFn = exports.createPaymentFn = exports.connectAccount = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const connectDemoAccount_1 = require("./accounts/connectDemoAccount");
const paymentService_1 = require("./payments/paymentService");
// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();
/**
 * Connect a demo bank account
 */
exports.connectAccount = functions.https.onCall(async (data, context) => {
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
        const account = await (0, connectDemoAccount_1.connectDemoAccount)(userId, userData, bankId, customUpiId);
        const connectedAccount = await (0, connectDemoAccount_1.completeAccountConnection)(userId, account.userId);
        const issuedAmount = await (0, connectDemoAccount_1.issueInitialDemoFunds)(userId, account.userId);
        return {
            success: true,
            data: {
                account: connectedAccount,
                issuedAmount,
            },
        };
    }
    catch (error) {
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
exports.createPaymentFn = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const senderId = context.auth.uid;
    const requestData = data.data || data;
    if (!requestData.recipientIdentifier || !requestData.amount || !requestData.mode) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }
    try {
        const payment = await (0, paymentService_1.createPayment)(senderId, requestData.recipientIdentifier, requestData.amount, requestData.mode, requestData.description, requestData.protectionSeconds, requestData.idempotencyKey);
        return {
            success: true,
            data: payment,
        };
    }
    catch (error) {
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
exports.acknowledgePaymentFn = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = context.auth.uid;
    const requestData = data.data || data;
    if (!requestData.paymentId) {
        throw new functions.https.HttpsError('invalid-argument', 'paymentId is required');
    }
    try {
        const payment = await (0, paymentService_1.acknowledgePayment)(requestData.paymentId, userId);
        return {
            success: true,
            data: payment,
        };
    }
    catch (error) {
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
exports.recoverPaymentFn = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = context.auth.uid;
    const requestData = data.data || data;
    if (!requestData.paymentId) {
        throw new functions.https.HttpsError('invalid-argument', 'paymentId is required');
    }
    try {
        const payment = await (0, paymentService_1.recoverPayment)(requestData.paymentId, userId, requestData.idempotencyKey);
        return {
            success: true,
            data: payment,
        };
    }
    catch (error) {
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
exports.settlePaymentFn = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const userId = context.auth.uid;
    const requestData = data.data || data;
    if (!requestData.paymentId) {
        throw new functions.https.HttpsError('invalid-argument', 'paymentId is required');
    }
    try {
        const payment = await (0, paymentService_1.settlePayment)(requestData.paymentId, userId, requestData.idempotencyKey);
        return {
            success: true,
            data: payment,
        };
    }
    catch (error) {
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
exports.processExpiredPayments = functions.pubsub.schedule('every 1 minutes').onRun(async () => {
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
                const freshPayment = freshDoc.data();
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
                const senderData = senderWallet.data();
                const recipientData = recipientWallet.data();
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
        }
        catch (error) {
            console.error(`Error processing payment ${doc.id}:`, error);
            results.push({ paymentId: doc.id, success: false, error: error.message });
        }
    }
    return { processed: results.length, results };
});
//# sourceMappingURL=index.js.map