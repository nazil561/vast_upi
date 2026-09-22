"use strict";
/**
 * PactPay - Payment Service
 *
 * Handles all payment operations with strict state machine enforcement
 * ALL payment operations MUST be server-side only
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
exports.createPayment = createPayment;
exports.acknowledgePayment = acknowledgePayment;
exports.recoverPayment = recoverPayment;
exports.settlePayment = settlePayment;
exports.getPayment = getPayment;
exports.getUserPayments = getUserPayments;
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const connectDemoAccount_1 = require("../accounts/connectDemoAccount");
const walletOperations_1 = require("../accounts/walletOperations");
const auditEvents_1 = require("../audit/auditEvents");
const idempotency_1 = require("../idempotency/idempotency");
const db = admin.firestore();
// Valid state transitions
const VALID_TRANSITIONS = {
    CREATED: ['PROTECTED'],
    PROTECTED: ['ACKNOWLEDGED', 'RECOVERY_PENDING', 'SETTLEMENT_PENDING', 'EXPIRED'],
    ACKNOWLEDGED: ['RECOVERY_PENDING', 'SETTLEMENT_PENDING', 'EXPIRED'],
    RECOVERY_PENDING: ['RECOVERED'],
    SETTLEMENT_PENDING: ['SETTLED'],
    RECOVERED: [], // Terminal state
    SETTLED: [], // Terminal state
    EXPIRED: ['SETTLED'],
    FAILED: [], // Terminal state
};
/**
 * Validate that a state transition is allowed
 */
function isValidTransition(from, to) {
    const allowedTransitions = VALID_TRANSITIONS[from] || [];
    return allowedTransitions.includes(to);
}
/**
 * Check if a status is terminal (cannot transition further)
 */
function isTerminalState(status) {
    const terminalStates = ['RECOVERED', 'SETTLED', 'FAILED'];
    return terminalStates.includes(status);
}
/**
 * Create a new payment (NORMAL or PROTECTED mode)
 *
 * This is the ONLY way to create payments.
 * Clients CANNOT directly create payment documents.
 */
async function createPayment(senderId, recipientIdentifier, // phone, UPI ID, or userId
amount, mode, description, protectionSeconds, idempotencyKey) {
    // Validate amount
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error(types_1.ERROR_CODES.INVALID_AMOUNT);
    }
    // Check idempotency
    const existingResult = await (0, idempotency_1.checkIdempotency)(senderId, 'createPayment', idempotencyKey, { recipientIdentifier, amount, mode, description });
    if (existingResult) {
        return existingResult;
    }
    // Validate sender account
    const senderAccount = await (0, connectDemoAccount_1.validateAccountEligible)(senderId, 'send_payment');
    // Find recipient by identifier
    let recipientAccount = null;
    // Try searching by UPI ID first
    if (recipientIdentifier.includes('@')) {
        const byUpi = await db.collection('demoAccounts')
            .where('upiId', '==', recipientIdentifier)
            .where('status', '==', 'CONNECTED')
            .limit(1)
            .get();
        if (!byUpi.empty) {
            recipientAccount = byUpi.docs[0].data();
        }
    }
    // Try searching by phone
    if (!recipientAccount) {
        const byPhone = await db.collection('demoAccounts')
            .where('mobile', '==', recipientIdentifier)
            .where('status', '==', 'CONNECTED')
            .limit(1)
            .get();
        if (!byPhone.empty) {
            recipientAccount = byPhone.docs[0].data();
        }
    }
    // Try searching by user ID
    if (!recipientAccount) {
        recipientAccount = await (0, connectDemoAccount_1.getAccountByUserId)(recipientIdentifier);
        if (recipientAccount && recipientAccount.status !== 'CONNECTED') {
            recipientAccount = null;
        }
    }
    if (!recipientAccount) {
        throw new Error(types_1.ERROR_CODES.RECIPIENT_NOT_CONNECTED);
    }
    const recipientId = recipientAccount.userId;
    // Prevent self-transfers (optional, can be enabled if desired)
    if (senderId === recipientId) {
        throw new Error('Self-transfers are not supported');
    }
    // Validate sender has sufficient AVAILABLE balance
    const senderWallet = await (0, walletOperations_1.getWallet)(senderId);
    if (!senderWallet) {
        throw new Error('Sender wallet not found');
    }
    (0, walletOperations_1.validateSufficientAvailableBalance)(senderWallet, amount);
    // Generate payment ID
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const now = admin.firestore.Timestamp.now();
    // Calculate expiry for protected payments
    const expiresAt = mode === 'PROTECTED'
        ? admin.firestore.Timestamp.fromMillis(Date.now() + (protectionSeconds || 600) * 1000)
        : undefined;
    const policyDoc = await db.collection('securityPolicies').doc(senderId).get();
    const policy = policyDoc.data();
    const verificationRequired = Boolean(policy?.verificationEnabled) && (amount >= Number(policy?.verificationThreshold || 100000) ||
        Boolean(policy?.verifyNewRecipient));
    return await db.runTransaction(async (transaction) => {
        const senderWalletRef = db.collection('wallets').doc(senderId);
        const recipientWalletRef = db.collection('wallets').doc(recipientId);
        const [senderWalletDoc, recipientWalletDoc] = await Promise.all([
            transaction.get(senderWalletRef),
            transaction.get(recipientWalletRef),
        ]);
        if (!senderWalletDoc.exists || !recipientWalletDoc.exists) {
            throw new Error('Wallet not found');
        }
        const senderWallet = senderWalletDoc.data();
        const recipientWallet = recipientWalletDoc.data();
        (0, walletOperations_1.validateSufficientAvailableBalance)(senderWallet, amount);
        let payment;
        if (mode === 'NORMAL') {
            // NORMAL payment: immediate transfer
            transaction.update(senderWalletRef, {
                availableBalance: senderWallet.availableBalance - amount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            transaction.update(recipientWalletRef, {
                availableBalance: recipientWallet.availableBalance + amount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            payment = {
                paymentId,
                id: paymentId,
                senderId: senderId,
                recipientId: recipientId,
                senderUserId: senderId,
                senderAccountId: senderAccount.accountNumber,
                recipientUserId: recipientId,
                recipientAccountId: recipientAccount.accountNumber,
                senderUpiId: senderAccount.upiId,
                recipientUpiId: recipientAccount.upiId,
                amount,
                currency: 'INR_DEMO',
                mode: 'NORMAL',
                status: 'SETTLED',
                description,
                createdAt: now,
                verificationRequired,
                verificationStatus: verificationRequired ? 'PENDING' : 'COMPLETED',
                recipientAcknowledged: true,
                createdBy: senderId,
                updatedAt: now,
            };
            transaction.set(db.collection('payments').doc(paymentId), payment);
            // Create audit events
            (0, auditEvents_1.createAuditEventsInTransaction)(transaction, [
                {
                    type: 'PAYMENT_CREATED',
                    actorId: senderId,
                    paymentId,
                    metadata: { mode: 'NORMAL', amount },
                    newState: { status: 'SETTLED' },
                },
                ...(verificationRequired ? [{
                        type: 'VERIFICATION_REQUIRED',
                        actorId: senderId,
                        paymentId,
                        metadata: { reason: 'AMOUNT_THRESHOLD' },
                    }] : []),
                {
                    type: 'PAYMENT_SETTLED',
                    actorId: senderId,
                    paymentId,
                    metadata: { settlementMethod: 'IMMEDIATE' },
                },
            ]);
        }
        else {
            // PROTECTED payment: move to protected balances
            transaction.update(senderWalletRef, {
                availableBalance: senderWallet.availableBalance - amount,
                protectedOutgoing: senderWallet.protectedOutgoing + amount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            transaction.update(recipientWalletRef, {
                protectedIncoming: recipientWallet.protectedIncoming + amount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            payment = {
                paymentId,
                id: paymentId,
                senderId: senderId,
                recipientId: recipientId,
                senderUserId: senderId,
                senderAccountId: senderAccount.accountNumber,
                recipientUserId: recipientId,
                recipientAccountId: recipientAccount.accountNumber,
                senderUpiId: senderAccount.upiId,
                recipientUpiId: recipientAccount.upiId,
                amount,
                currency: 'INR_DEMO',
                mode: 'PROTECTED',
                status: 'PROTECTED',
                description,
                createdAt: now,
                expiresAt,
                protectionSeconds: protectionSeconds || 600,
                verificationRequired,
                verificationStatus: verificationRequired ? 'PENDING' : 'COMPLETED',
                recipientAcknowledged: false,
                createdBy: senderId,
                updatedAt: now,
            };
            transaction.set(db.collection('payments').doc(paymentId), payment);
            // Create audit events
            (0, auditEvents_1.createAuditEventsInTransaction)(transaction, [
                {
                    type: 'PAYMENT_CREATED',
                    actorId: senderId,
                    paymentId,
                    metadata: { mode: 'PROTECTED', amount },
                    newState: { status: 'PROTECTED' },
                },
                {
                    type: 'PAYMENT_PROTECTED',
                    actorId: senderId,
                    paymentId,
                    metadata: {
                        protectionSeconds,
                        expiresAt: expiresAt?.toDate().toISOString(),
                    },
                },
                ...(verificationRequired ? [{
                        type: 'VERIFICATION_REQUIRED',
                        actorId: senderId,
                        paymentId,
                        metadata: { reason: 'AMOUNT_THRESHOLD' },
                    }] : []),
            ]);
        }
        return payment;
    });
}
/**
 * Acknowledge a protected payment (recipient confirms receipt visibility)
 */
async function acknowledgePayment(paymentId, userId) {
    const paymentRef = db.collection('payments').doc(paymentId);
    return await db.runTransaction(async (transaction) => {
        const paymentDoc = await transaction.get(paymentRef);
        if (!paymentDoc.exists) {
            throw new Error('Payment not found');
        }
        const payment = paymentDoc.data();
        // Verify caller is the recipient
        if (payment.recipientUserId !== userId) {
            throw new Error(types_1.ERROR_CODES.UNAUTHORIZED_OPERATION);
        }
        // Validate state transition
        if (!isValidTransition(payment.status, 'ACKNOWLEDGED')) {
            throw new Error(`${types_1.ERROR_CODES.INVALID_PAYMENT_STATE}: Cannot acknowledge from ${payment.status}`);
        }
        const updatedPayment = {
            ...payment,
            status: 'ACKNOWLEDGED',
            recipientAcknowledged: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        transaction.update(paymentRef, updatedPayment);
        // Create audit event
        (0, auditEvents_1.createAuditEventsInTransaction)(transaction, [
            {
                type: 'PAYMENT_ACKNOWLEDGED',
                actorId: userId,
                paymentId,
                metadata: {},
                previousState: payment.status,
                newState: 'ACKNOWLEDGED',
            },
        ]);
        return updatedPayment;
    });
}
/**
 * Recover a protected payment (sender takes funds back)
 */
async function recoverPayment(paymentId, userId, idempotencyKey) {
    // Check idempotency
    const existingResult = await (0, idempotency_1.checkIdempotency)(userId, 'recoverPayment', idempotencyKey, { paymentId });
    if (existingResult) {
        return existingResult;
    }
    const paymentRef = db.collection('payments').doc(paymentId);
    return await db.runTransaction(async (transaction) => {
        const paymentDoc = await transaction.get(paymentRef);
        if (!paymentDoc.exists) {
            throw new Error('Payment not found');
        }
        const payment = paymentDoc.data();
        // Verify caller is the sender
        if (payment.senderUserId !== userId) {
            throw new Error(types_1.ERROR_CODES.UNAUTHORIZED_OPERATION);
        }
        // Check if already in terminal state
        if (isTerminalState(payment.status)) {
            throw new Error(`${types_1.ERROR_CODES.INVALID_PAYMENT_STATE}: Payment is already ${payment.status}`);
        }
        // Validate state transition
        if (!isValidTransition(payment.status, 'RECOVERY_PENDING') &&
            !isValidTransition(payment.status, 'RECOVERED')) {
            throw new Error(`${types_1.ERROR_CODES.INVALID_PAYMENT_STATE}: Cannot recover from ${payment.status}`);
        }
        const senderWalletRef = db.collection('wallets').doc(payment.senderUserId);
        const recipientWalletRef = db.collection('wallets').doc(payment.recipientUserId);
        const [senderWalletDoc, recipientWalletDoc] = await Promise.all([
            transaction.get(senderWalletRef),
            transaction.get(recipientWalletRef),
        ]);
        const senderWallet = senderWalletDoc.data();
        const recipientWallet = recipientWalletDoc.data();
        if (!senderWalletDoc.exists || !recipientWalletDoc.exists ||
            senderWallet.protectedOutgoing < payment.amount ||
            recipientWallet.protectedIncoming < payment.amount) {
            throw new Error('Protected balance is inconsistent');
        }
        transaction.update(senderWalletRef, {
            availableBalance: senderWallet.availableBalance + payment.amount,
            protectedOutgoing: senderWallet.protectedOutgoing - payment.amount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(recipientWalletRef, {
            protectedIncoming: recipientWallet.protectedIncoming - payment.amount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const updatedPayment = {
            ...payment,
            status: 'RECOVERED',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        transaction.update(paymentRef, updatedPayment);
        // Create audit events
        (0, auditEvents_1.createAuditEventsInTransaction)(transaction, [
            {
                type: 'RECOVERY_REQUESTED',
                actorId: userId,
                paymentId,
                metadata: {},
            },
            {
                type: 'PAYMENT_RECOVERED',
                actorId: userId,
                paymentId,
                metadata: {},
                previousState: payment.status,
                newState: 'RECOVERED',
            },
        ]);
        return updatedPayment;
    });
}
/**
 * Settle a protected payment (sender confirms, funds become spendable)
 */
async function settlePayment(paymentId, userId, idempotencyKey) {
    // Check idempotency
    const existingResult = await (0, idempotency_1.checkIdempotency)(userId, 'settlePayment', idempotencyKey, { paymentId });
    if (existingResult) {
        return existingResult;
    }
    const paymentRef = db.collection('payments').doc(paymentId);
    return await db.runTransaction(async (transaction) => {
        const paymentDoc = await transaction.get(paymentRef);
        if (!paymentDoc.exists) {
            throw new Error('Payment not found');
        }
        const payment = paymentDoc.data();
        // Verify caller is the sender (only sender can settle)
        if (payment.senderUserId !== userId) {
            throw new Error(types_1.ERROR_CODES.UNAUTHORIZED_OPERATION);
        }
        // Check if already in terminal state
        if (isTerminalState(payment.status)) {
            throw new Error(`${types_1.ERROR_CODES.INVALID_PAYMENT_STATE}: Payment is already ${payment.status}`);
        }
        // Validate state transition
        if (!isValidTransition(payment.status, 'SETTLEMENT_PENDING') &&
            !isValidTransition(payment.status, 'SETTLED')) {
            throw new Error(`${types_1.ERROR_CODES.INVALID_PAYMENT_STATE}: Cannot settle from ${payment.status}`);
        }
        const senderWalletRef = db.collection('wallets').doc(payment.senderUserId);
        const recipientWalletRef = db.collection('wallets').doc(payment.recipientUserId);
        const [senderWalletDoc, recipientWalletDoc] = await Promise.all([
            transaction.get(senderWalletRef),
            transaction.get(recipientWalletRef),
        ]);
        const senderWallet = senderWalletDoc.data();
        const recipientWallet = recipientWalletDoc.data();
        if (!senderWalletDoc.exists || !recipientWalletDoc.exists ||
            senderWallet.protectedOutgoing < payment.amount ||
            recipientWallet.protectedIncoming < payment.amount) {
            throw new Error('Protected balance is inconsistent');
        }
        transaction.update(senderWalletRef, {
            protectedOutgoing: senderWallet.protectedOutgoing - payment.amount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(recipientWalletRef, {
            protectedIncoming: recipientWallet.protectedIncoming - payment.amount,
            availableBalance: recipientWallet.availableBalance + payment.amount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const updatedPayment = {
            ...payment,
            status: 'SETTLED',
            settlementMethod: 'MANUAL',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        transaction.update(paymentRef, updatedPayment);
        // Create audit events
        (0, auditEvents_1.createAuditEventsInTransaction)(transaction, [
            {
                type: 'SETTLEMENT_REQUESTED',
                actorId: userId,
                paymentId,
                metadata: {},
            },
            {
                type: 'PAYMENT_SETTLED',
                actorId: userId,
                paymentId,
                metadata: { method: 'MANUAL' },
                previousState: payment.status,
                newState: 'SETTLED',
            },
        ]);
        return updatedPayment;
    });
}
/**
 * Get payment by ID
 */
async function getPayment(paymentId) {
    const paymentDoc = await db.collection('payments').doc(paymentId).get();
    if (!paymentDoc.exists) {
        return null;
    }
    return paymentDoc.data();
}
/**
 * Get payments for a user (as sender or recipient)
 */
async function getUserPayments(userId, limit = 50) {
    const snapshot = await db.collection('payments')
        .where('senderUserId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
    const sentPayments = snapshot.docs.map(doc => doc.data());
    const receivedSnapshot = await db.collection('payments')
        .where('recipientUserId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
    const receivedPayments = receivedSnapshot.docs.map(doc => doc.data());
    // Combine and sort
    const allPayments = [...sentPayments, ...receivedPayments];
    allPayments.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    return allPayments.slice(0, limit);
}
//# sourceMappingURL=paymentService.js.map