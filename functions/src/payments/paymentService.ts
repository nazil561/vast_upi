/**
 * PactPay - Payment Service
 * 
 * Handles all payment operations with strict state machine enforcement
 * ALL payment operations MUST be server-side only
 */

import * as admin from 'firebase-admin';
import {
  PaymentData,
  PaymentMode,
  PaymentStatus,
  DemoAccountData,
  ERROR_CODES,
} from '../types';
import { getAccountByUserId, validateAccountEligible } from '../accounts/connectDemoAccount';
import {
  getWallet,
  validateSufficientAvailableBalance,
  moveAvailableToProtectedOutgoing,
  creditProtectedIncoming,
} from '../accounts/walletOperations';
import { createAuditEventsInTransaction } from '../audit/auditEvents';
import { checkIdempotency } from '../idempotency/idempotency';

const db = admin.firestore();

// Valid state transitions
const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
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
function isValidTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  const allowedTransitions = VALID_TRANSITIONS[from] || [];
  return allowedTransitions.includes(to);
}

/**
 * Check if a status is terminal (cannot transition further)
 */
function isTerminalState(status: PaymentStatus): boolean {
  const terminalStates: PaymentStatus[] = ['RECOVERED', 'SETTLED', 'FAILED'];
  return terminalStates.includes(status);
}

/**
 * Create a new payment (NORMAL or PROTECTED mode)
 * 
 * This is the ONLY way to create payments.
 * Clients CANNOT directly create payment documents.
 */
export async function createPayment(
  senderId: string,
  recipientIdentifier: string, // phone, UPI ID, or userId
  amount: number,
  mode: PaymentMode,
  description?: string,
  protectionSeconds?: number,
  idempotencyKey?: string
): Promise<PaymentData> {
  // Validate amount
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(ERROR_CODES.INVALID_AMOUNT);
  }
  
  // Check idempotency
  const existingResult = await checkIdempotency(
    senderId,
    'createPayment',
    idempotencyKey,
    { recipientIdentifier, amount, mode, description }
  );
  
  if (existingResult) {
    return existingResult as PaymentData;
  }
  
  // Validate sender account
  const senderAccount = await validateAccountEligible(senderId, 'send_payment');
  
  // Find recipient by identifier
  let recipientAccount: DemoAccountData | null = null;
  
  // Try searching by UPI ID first
  if (recipientIdentifier.includes('@')) {
    const byUpi = await db.collection('demoAccounts')
      .where('upiId', '==', recipientIdentifier)
      .where('status', '==', 'CONNECTED')
      .limit(1)
      .get();
    
    if (!byUpi.empty) {
      recipientAccount = byUpi.docs[0].data() as DemoAccountData;
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
      recipientAccount = byPhone.docs[0].data() as DemoAccountData;
    }
  }
  
  // Try searching by user ID
  if (!recipientAccount) {
    recipientAccount = await getAccountByUserId(recipientIdentifier);
    
    if (recipientAccount && recipientAccount.status !== 'CONNECTED') {
      recipientAccount = null;
    }
  }
  
  if (!recipientAccount) {
    throw new Error(ERROR_CODES.RECIPIENT_NOT_CONNECTED);
  }
  
  const recipientId = recipientAccount.userId;
  
  // Prevent self-transfers (optional, can be enabled if desired)
  if (senderId === recipientId) {
    throw new Error('Self-transfers are not supported');
  }
  
  // Validate sender has sufficient AVAILABLE balance
  const senderWallet = await getWallet(senderId);
  
  if (!senderWallet) {
    throw new Error('Sender wallet not found');
  }
  
  validateSufficientAvailableBalance(senderWallet, amount);
  
  // Generate payment ID
  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  const now = admin.firestore.Timestamp.now();
  
  // Calculate expiry for protected payments
  const expiresAt = mode === 'PROTECTED'
    ? admin.firestore.Timestamp.fromMillis(
        Date.now() + (protectionSeconds || 600) * 1000
      )
    : undefined;
  
  const policyDoc = await db.collection('securityPolicies').doc(senderId).get();
  const policy = policyDoc.data() as any;
  const verificationRequired = Boolean(policy?.verificationEnabled) && (
    amount >= Number(policy?.verificationThreshold || 100000) ||
    Boolean(policy?.verifyNewRecipient)
  );
  
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

    const senderWallet = senderWalletDoc.data() as any;
    const recipientWallet = recipientWalletDoc.data() as any;
    validateSufficientAvailableBalance(senderWallet, amount);
    let payment: PaymentData;
    
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
      createAuditEventsInTransaction(transaction, [
        {
          type: 'PAYMENT_CREATED',
          actorId: senderId,
          paymentId,
          metadata: { mode: 'NORMAL', amount },
          newState: { status: 'SETTLED' },
        },
        ...(verificationRequired ? [{
          type: 'VERIFICATION_REQUIRED' as const,
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
      
    } else {
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
      createAuditEventsInTransaction(transaction, [
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
          type: 'VERIFICATION_REQUIRED' as const,
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
export async function acknowledgePayment(
  paymentId: string,
  userId: string
): Promise<PaymentData> {
  const paymentRef = db.collection('payments').doc(paymentId);
  
  return await db.runTransaction(async (transaction) => {
    const paymentDoc = await transaction.get(paymentRef);
    
    if (!paymentDoc.exists) {
      throw new Error('Payment not found');
    }
    
    const payment = paymentDoc.data() as PaymentData;
    
    // Verify caller is the recipient
    if (payment.recipientUserId !== userId) {
      throw new Error(ERROR_CODES.UNAUTHORIZED_OPERATION);
    }
    
    // Validate state transition
    if (!isValidTransition(payment.status, 'ACKNOWLEDGED')) {
      throw new Error(`${ERROR_CODES.INVALID_PAYMENT_STATE}: Cannot acknowledge from ${payment.status}`);
    }
    
    const updatedPayment: PaymentData = {
      ...payment,
      status: 'ACKNOWLEDGED',
      recipientAcknowledged: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    transaction.update(paymentRef, updatedPayment as any);
    
    // Create audit event
    createAuditEventsInTransaction(transaction, [
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
export async function recoverPayment(
  paymentId: string,
  userId: string,
  idempotencyKey?: string
): Promise<PaymentData> {
  // Check idempotency
  const existingResult = await checkIdempotency(
    userId,
    'recoverPayment',
    idempotencyKey,
    { paymentId }
  );
  
  if (existingResult) {
    return existingResult as PaymentData;
  }
  
  const paymentRef = db.collection('payments').doc(paymentId);
  
  return await db.runTransaction(async (transaction) => {
    const paymentDoc = await transaction.get(paymentRef);
    
    if (!paymentDoc.exists) {
      throw new Error('Payment not found');
    }
    
    const payment = paymentDoc.data() as PaymentData;
    
    // Verify caller is the sender
    if (payment.senderUserId !== userId) {
      throw new Error(ERROR_CODES.UNAUTHORIZED_OPERATION);
    }
    
    // Check if already in terminal state
    if (isTerminalState(payment.status)) {
      throw new Error(`${ERROR_CODES.INVALID_PAYMENT_STATE}: Payment is already ${payment.status}`);
    }
    
    // Validate state transition
    if (!isValidTransition(payment.status, 'RECOVERY_PENDING') && 
        !isValidTransition(payment.status, 'RECOVERED')) {
      throw new Error(`${ERROR_CODES.INVALID_PAYMENT_STATE}: Cannot recover from ${payment.status}`);
    }
    
    const senderWalletRef = db.collection('wallets').doc(payment.senderUserId);
    const recipientWalletRef = db.collection('wallets').doc(payment.recipientUserId);
    const [senderWalletDoc, recipientWalletDoc] = await Promise.all([
      transaction.get(senderWalletRef),
      transaction.get(recipientWalletRef),
    ]);
    const senderWallet = senderWalletDoc.data() as any;
    const recipientWallet = recipientWalletDoc.data() as any;
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
    
    const updatedPayment: PaymentData = {
      ...payment,
      status: 'RECOVERED',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    transaction.update(paymentRef, updatedPayment as any);
    
    // Create audit events
    createAuditEventsInTransaction(transaction, [
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
export async function settlePayment(
  paymentId: string,
  userId: string,
  idempotencyKey?: string
): Promise<PaymentData> {
  // Check idempotency
  const existingResult = await checkIdempotency(
    userId,
    'settlePayment',
    idempotencyKey,
    { paymentId }
  );
  
  if (existingResult) {
    return existingResult as PaymentData;
  }
  
  const paymentRef = db.collection('payments').doc(paymentId);
  
  return await db.runTransaction(async (transaction) => {
    const paymentDoc = await transaction.get(paymentRef);
    
    if (!paymentDoc.exists) {
      throw new Error('Payment not found');
    }
    
    const payment = paymentDoc.data() as PaymentData;
    
    // Verify caller is the sender (only sender can settle)
    if (payment.senderUserId !== userId) {
      throw new Error(ERROR_CODES.UNAUTHORIZED_OPERATION);
    }
    
    // Check if already in terminal state
    if (isTerminalState(payment.status)) {
      throw new Error(`${ERROR_CODES.INVALID_PAYMENT_STATE}: Payment is already ${payment.status}`);
    }
    
    // Validate state transition
    if (!isValidTransition(payment.status, 'SETTLEMENT_PENDING') &&
        !isValidTransition(payment.status, 'SETTLED')) {
      throw new Error(`${ERROR_CODES.INVALID_PAYMENT_STATE}: Cannot settle from ${payment.status}`);
    }
    
    const senderWalletRef = db.collection('wallets').doc(payment.senderUserId);
    const recipientWalletRef = db.collection('wallets').doc(payment.recipientUserId);
    const [senderWalletDoc, recipientWalletDoc] = await Promise.all([
      transaction.get(senderWalletRef),
      transaction.get(recipientWalletRef),
    ]);
    const senderWallet = senderWalletDoc.data() as any;
    const recipientWallet = recipientWalletDoc.data() as any;
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
    
    const updatedPayment: PaymentData = {
      ...payment,
      status: 'SETTLED',
      settlementMethod: 'MANUAL',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    transaction.update(paymentRef, updatedPayment as any);
    
    // Create audit events
    createAuditEventsInTransaction(transaction, [
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
export async function getPayment(paymentId: string): Promise<PaymentData | null> {
  const paymentDoc = await db.collection('payments').doc(paymentId).get();
  
  if (!paymentDoc.exists) {
    return null;
  }
  
  return paymentDoc.data() as PaymentData;
}

/**
 * Get payments for a user (as sender or recipient)
 */
export async function getUserPayments(userId: string, limit: number = 50): Promise<PaymentData[]> {
  const snapshot = await db.collection('payments')
    .where('senderUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  const sentPayments = snapshot.docs.map(doc => doc.data() as PaymentData);
  
  const receivedSnapshot = await db.collection('payments')
    .where('recipientUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  const receivedPayments = receivedSnapshot.docs.map(doc => doc.data() as PaymentData);
  
  // Combine and sort
  const allPayments = [...sentPayments, ...receivedPayments];
  allPayments.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  
  return allPayments.slice(0, limit);
}
