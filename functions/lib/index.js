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
exports.processExpiredPayments = exports.settlePaymentFn = exports.recoverPaymentFn = exports.acknowledgePaymentFn = exports.createPaymentFn = exports.connectDemoAccount = exports.connectAccount = exports.getRecipientTrustProfile = exports.searchConnectedUsers = exports.updateSecurityPolicyFn = exports.verifyDemoKyc = exports.submitDemoKyc = exports.ensureProfile = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const connectDemoAccount_1 = require("./accounts/connectDemoAccount");
const paymentService_1 = require("./payments/paymentService");
// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();
const DEFAULT_SECURITY_POLICY = {
    verificationEnabled: true,
    verificationThreshold: 100000,
    verifyNewRecipient: true,
    verifyRecovery: true,
    verifySettlement: true,
    protectionPeriodSeconds: 600,
};
exports.ensureProfile = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const uid = context.auth.uid;
    const userRef = db.collection('users').doc(uid);
    const walletRef = db.collection('wallets').doc(uid);
    const policyRef = db.collection('securityPolicies').doc(uid);
    const authUser = await admin.auth().getUser(uid);
    const displayName = String(data.displayName || authUser.displayName || authUser.email?.split('@')[0] || 'PactPay User').trim();
    const requestedUpi = String(data.upiId || '').trim().toLowerCase();
    if (requestedUpi) {
        const existingUpi = await db.collection('users').where('upiId', '==', requestedUpi).limit(1).get();
        if (!existingUpi.empty && existingUpi.docs[0].id !== uid) {
            throw new functions.https.HttpsError('already-exists', 'This PactPay ID is already in use');
        }
    }
    await db.runTransaction(async (transaction) => {
        const [userDoc, walletDoc, policyDoc] = await Promise.all([
            transaction.get(userRef),
            transaction.get(walletRef),
            transaction.get(policyRef),
        ]);
        const now = admin.firestore.FieldValue.serverTimestamp();
        if (!userDoc.exists) {
            const suffix = Math.random().toString(36).slice(2, 6);
            const upiId = requestedUpi || `${displayName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user'}${suffix}@pactpay`;
            transaction.set(userRef, {
                uid,
                displayName,
                email: authUser.email || null,
                phone: authUser.phoneNumber || null,
                upiId,
                accountConnectionState: 'NOT_CONNECTED',
                kycStatus: 'NOT_STARTED',
                createdAt: now,
                updatedAt: now,
            });
        }
        if (!walletDoc.exists) {
            transaction.set(walletRef, {
                uid,
                availableBalance: 0,
                protectedOutgoing: 0,
                protectedIncoming: 0,
                currency: 'INR_DEMO',
                updatedAt: now,
            });
        }
        if (!policyDoc.exists) {
            transaction.set(policyRef, { uid, ...DEFAULT_SECURITY_POLICY, updatedAt: now });
        }
    });
    return { success: true, data: (await userRef.get()).data() };
});
exports.submitDemoKyc = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const required = [data.displayName, data.dateOfBirth, data.address, data.city, data.state, data.pinCode, data.documentType];
    if (required.some((value) => !String(value || '').trim()) || data.consent !== true) {
        throw new functions.https.HttpsError('invalid-argument', 'Complete the demo KYC form and consent');
    }
    const uid = context.auth.uid;
    const userRef = db.collection('users').doc(uid);
    const kycRef = db.collection('kycProfiles').doc(uid);
    if (!(await userRef.get()).exists) {
        throw new functions.https.HttpsError('failed-precondition', 'Profile must be initialized first');
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    const kycProfile = {
        uid,
        status: 'VERIFICATION_PENDING',
        demoOnly: true,
        documentType: String(data.documentType),
        syntheticDocumentId: `DEMO-${String(data.documentType)}-XXXX`,
        displayName: String(data.displayName).trim(),
        dateOfBirth: String(data.dateOfBirth),
        address: String(data.address).trim(),
        city: String(data.city).trim(),
        state: String(data.state).trim(),
        pinCode: String(data.pinCode).trim(),
        consentedAt: now,
        updatedAt: now,
    };
    await db.runTransaction(async (transaction) => {
        transaction.set(kycRef, kycProfile, { merge: true });
        transaction.update(userRef, {
            displayName: kycProfile.displayName,
            dateOfBirth: kycProfile.dateOfBirth,
            address: kycProfile.address,
            city: kycProfile.city,
            state: kycProfile.state,
            pinCode: kycProfile.pinCode,
            kycStatus: 'VERIFICATION_PENDING',
            kycDocumentType: kycProfile.documentType,
            accountConnectionState: 'KYC_PENDING',
            updatedAt: now,
        });
    });
    return { success: true, data: { status: 'VERIFICATION_PENDING', syntheticDocumentId: kycProfile.syntheticDocumentId } };
});
exports.verifyDemoKyc = functions.https.onCall(async (_data, context) => {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const uid = context.auth.uid;
    const userRef = db.collection('users').doc(uid);
    const kycRef = db.collection('kycProfiles').doc(uid);
    const [userDoc, kycDoc] = await Promise.all([userRef.get(), kycRef.get()]);
    if (!userDoc.exists || !kycDoc.exists || kycDoc.data()?.status !== 'VERIFICATION_PENDING') {
        throw new functions.https.HttpsError('failed-precondition', 'Submit demo KYC before verification');
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
        transaction.update(kycRef, {
            status: 'VERIFIED',
            identityStatus: 'VERIFIED',
            addressStatus: 'VERIFIED',
            verificationStatus: 'VERIFIED',
            verifiedAt: now,
            updatedAt: now,
        });
        transaction.update(userRef, {
            kycStatus: 'VERIFIED',
            accountConnectionState: 'KYC_VERIFIED',
            updatedAt: now,
        });
    });
    return { success: true, data: { status: 'VERIFIED' } };
});
exports.updateSecurityPolicyFn = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const policy = {
        verificationEnabled: Boolean(data.verificationEnabled),
        verificationThreshold: Number(data.verificationThreshold),
        verifyNewRecipient: Boolean(data.verifyNewRecipient),
        verifyRecovery: Boolean(data.verifyRecovery),
        verifySettlement: Boolean(data.verifySettlement),
        protectionPeriodSeconds: Number(data.protectionPeriodSeconds),
    };
    if (!Number.isInteger(policy.verificationThreshold) || policy.verificationThreshold < 0 ||
        !Number.isInteger(policy.protectionPeriodSeconds) || policy.protectionPeriodSeconds < 30) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid security policy');
    }
    await db.collection('securityPolicies').doc(context.auth.uid).set({
        uid: context.auth.uid,
        ...policy,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { success: true };
});
exports.searchConnectedUsers = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const term = String(data.searchTerm || '').trim().toLowerCase();
    if (!term)
        return { success: true, data: [] };
    const snapshot = await db.collection('users')
        .where('accountConnectionState', '==', 'CONNECTED')
        .limit(100)
        .get();
    const matches = snapshot.docs
        .map((doc) => ({ uid: doc.id, ...doc.data() }))
        .filter((user) => [user.displayName, user.upiId, user.phone].some((value) => String(value || '').toLowerCase().includes(term)))
        .filter((user) => user.uid !== context.auth.uid)
        .map((user) => ({
        uid: user.uid,
        displayName: user.displayName,
        upiId: user.upiId,
        phone: user.phone || undefined,
        accountConnectionState: user.accountConnectionState,
        connectedBankName: user.connectedBankName,
        demoAccountNumber: user.demoAccountNumber ? `••••${String(user.demoAccountNumber).slice(-4)}` : undefined,
        createdAt: user.createdAt,
    }));
    return { success: true, data: matches };
});
exports.getRecipientTrustProfile = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const recipientId = String(data.recipientId || '').trim();
    if (!recipientId || recipientId === context.auth.uid) {
        throw new functions.https.HttpsError('invalid-argument', 'Recipient is required');
    }
    const [userDoc, accountDoc, kycDoc] = await Promise.all([
        db.collection('users').doc(recipientId).get(),
        db.collection('demoAccounts').doc(recipientId).get(),
        db.collection('kycProfiles').doc(recipientId).get(),
    ]);
    const user = userDoc.data();
    const account = accountDoc.data();
    const kyc = kycDoc.data();
    if (!userDoc.exists || !accountDoc.exists || user.accountConnectionState !== 'CONNECTED') {
        throw new functions.https.HttpsError('not-found', 'Recipient account is not connected');
    }
    if (user.trustProfileSharingEnabled === false) {
        return { success: true, data: { available: false } };
    }
    return {
        success: true,
        data: {
            available: true,
            uid: recipientId,
            displayName: user.displayName,
            upiId: user.upiId,
            phoneVerified: Boolean(user.phone),
            identityVerified: kyc?.status === 'VERIFIED',
            addressVerified: kyc?.addressStatus === 'VERIFIED',
            kycDocumentType: kyc?.documentType || 'DEMO',
            connectedBankName: account.bankName,
            demoAccountNumber: `••••${String(account.accountNumber).slice(-4)}`,
            accountType: account.accountType || 'SAVINGS_DEMO',
            accountStatus: account.status,
            profileCreatedAt: user.createdAt,
            sharingEnabled: true,
        },
    };
});
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
    const accountType = requestData.accountType === 'CURRENT_DEMO' ? 'CURRENT_DEMO' : 'SAVINGS_DEMO';
    if (!bankId) {
        throw new functions.https.HttpsError('invalid-argument', 'bankId is required');
    }
    try {
        const profileDoc = await db.collection('users').doc(userId).get();
        const kycProfile = await db.collection('kycProfiles').doc(userId).get();
        if (!profileDoc.exists || profileDoc.data()?.kycStatus !== 'VERIFIED' || kycProfile.data()?.status !== 'VERIFIED') {
            throw new functions.https.HttpsError('failed-precondition', 'Complete demo KYC before connecting an account');
        }
        const userRecord = await admin.auth().getUser(userId);
        const userData = {
            displayName: userRecord.displayName || 'User',
            phoneNumber: userRecord.phoneNumber || '',
        };
        const account = await (0, connectDemoAccount_1.connectDemoAccount)(userId, userData, bankId, customUpiId, accountType);
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
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        if (error.code) {
            throw new functions.https.HttpsError(error.code, error.message);
        }
        throw new functions.https.HttpsError('internal', error.message);
    }
});
exports.connectDemoAccount = exports.connectAccount;
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
    if (requestData.recipientTrustChecked !== true) {
        throw new functions.https.HttpsError('failed-precondition', 'Complete Recipient Trust Check before paying');
    }
    const policyDoc = await db.collection('securityPolicies').doc(senderId).get();
    const policy = policyDoc.data() || DEFAULT_SECURITY_POLICY;
    const requiresVerification = Boolean(policy.verificationEnabled) && (Number(requestData.amount) >= Number(policy.verificationThreshold) || Boolean(policy.verifyNewRecipient));
    if (requiresVerification && requestData.verificationConfirmed !== true) {
        throw new functions.https.HttpsError('failed-precondition', 'Payment verification is required');
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