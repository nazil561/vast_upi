/**
 * PactPay - Wallet Operations
 * 
 * Handles all wallet balance modifications
 * ALL wallet operations MUST be server-side only
 */

import * as admin from 'firebase-admin';
import { WalletData, ERROR_CODES } from '../types';

const db = admin.firestore();

/**
 * Get or create a wallet for a user
 */
export async function getOrCreateWallet(userId: string): Promise<WalletData> {
  const walletRef = db.collection('wallets').doc(userId);
  
  return await db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    
    if (walletDoc.exists) {
      return walletDoc.data() as WalletData;
    }
    
    // Create new wallet with zero balances
    const now = admin.firestore.Timestamp.now();
    const newWallet: WalletData = {
      userId,
      availableBalance: 0,
      protectedIncoming: 0,
      protectedOutgoing: 0,
      currency: 'INR_DEMO',
      updatedAt: now,
    };
    
    transaction.set(walletRef, newWallet);
    
    return newWallet;
  });
}

/**
 * Validate that a wallet has sufficient AVAILABLE balance
 * This is the CRITICAL security check that prevents spending protected funds
 * 
 * @param wallet - The wallet to check
 * @param amount - The amount to spend
 * @throws Error if insufficient available balance
 */
export function validateSufficientAvailableBalance(
  wallet: WalletData,
  amount: number
): void {
  if (wallet.availableBalance < amount) {
    throw new Error(
      `${ERROR_CODES.INSUFFICIENT_BALANCE}: Available=${wallet.availableBalance}, Requested=${amount}`
    );
  }
}

/**
 * CRITICAL: Verify that protected incoming funds are NOT being spent
 * This is a defense-in-depth check
 */
export function verifyProtectedFundsNotSpent(
  wallet: WalletData,
  requestedAmount: number
): void {
  // The spendable amount is ONLY availableBalance
  // Never: availableBalance + protectedIncoming
  const maxSpendable = wallet.availableBalance;
  
  if (requestedAmount > maxSpendable) {
    throw new Error(ERROR_CODES.PROTECTED_FUNDS_NOT_SPENDABLE);
  }
}

/**
 * Debit from available balance and move to protected outgoing
 * Used when creating a protected payment
 */
export async function moveAvailableToProtectedOutgoing(
  userId: string,
  amount: number
): Promise<void> {
  const walletRef = db.collection('wallets').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const wallet = walletDoc.data() as WalletData;
    
    // CRITICAL: Validate sufficient available balance
    validateSufficientAvailableBalance(wallet, amount);
    
    // Perform the atomic transfer
    const newAvailable = wallet.availableBalance - amount;
    const newProtectedOutgoing = wallet.protectedOutgoing + amount;
    
    transaction.update(walletRef, {
      availableBalance: newAvailable,
      protectedOutgoing: newProtectedOutgoing,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Credit to protected incoming
 * Used when receiving a protected payment
 */
export async function creditProtectedIncoming(
  userId: string,
  amount: number
): Promise<void> {
  const walletRef = db.collection('wallets').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const wallet = walletDoc.data() as WalletData;
    
    const newProtectedIncoming = wallet.protectedIncoming + amount;
    
    transaction.update(walletRef, {
      protectedIncoming: newProtectedIncoming,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Reverse protected outgoing back to available
 * Used when a protected payment is recovered
 */
export async function reverseProtectedOutgoingToAvailable(
  userId: string,
  amount: number
): Promise<void> {
  const walletRef = db.collection('wallets').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const wallet = walletDoc.data() as WalletData;
    
    // Verify the wallet has enough protected outgoing to reverse
    if (wallet.protectedOutgoing < amount) {
      throw new Error('Insufficient protected outgoing balance');
    }
    
    const newAvailable = wallet.availableBalance + amount;
    const newProtectedOutgoing = wallet.protectedOutgoing - amount;
    
    transaction.update(walletRef, {
      availableBalance: newAvailable,
      protectedOutgoing: newProtectedOutgoing,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Reverse protected incoming
 * Used when a protected payment is recovered or expires
 */
export async function reverseProtectedIncoming(
  userId: string,
  amount: number
): Promise<void> {
  const walletRef = db.collection('wallets').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const wallet = walletDoc.data() as WalletData;
    
    // Verify the wallet has enough protected incoming to reverse
    if (wallet.protectedIncoming < amount) {
      throw new Error('Insufficient protected incoming balance');
    }
    
    const newProtectedIncoming = wallet.protectedIncoming - amount;
    
    transaction.update(walletRef, {
      protectedIncoming: newProtectedIncoming,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Move protected incoming to available
 * Used when a protected payment is settled
 */
export async function settleProtectedIncoming(
  userId: string,
  amount: number
): Promise<void> {
  const walletRef = db.collection('wallets').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const wallet = walletDoc.data() as WalletData;
    
    // Verify the wallet has enough protected incoming to settle
    if (wallet.protectedIncoming < amount) {
      throw new Error('Insufficient protected incoming balance');
    }
    
    const newAvailable = wallet.availableBalance + amount;
    const newProtectedIncoming = wallet.protectedIncoming - amount;
    
    transaction.update(walletRef, {
      availableBalance: newAvailable,
      protectedIncoming: newProtectedIncoming,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Move protected outgoing to settled (remove from protected)
 * Used when a protected payment is settled
 */
export async function settleProtectedOutgoing(
  userId: string,
  amount: number
): Promise<void> {
  const walletRef = db.collection('wallets').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const wallet = walletDoc.data() as WalletData;
    
    // Verify the wallet has enough protected outgoing to settle
    if (wallet.protectedOutgoing < amount) {
      throw new Error('Insufficient protected outgoing balance');
    }
    
    const newProtectedOutgoing = wallet.protectedOutgoing - amount;
    
    transaction.update(walletRef, {
      protectedOutgoing: newProtectedOutgoing,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Perform a normal (immediate) transfer between two wallets
 * Used for non-protected payments
 */
export async function performNormalTransfer(
  senderId: string,
  recipientId: string,
  amount: number
): Promise<void> {
  const senderWalletRef = db.collection('wallets').doc(senderId);
  const recipientWalletRef = db.collection('wallets').doc(recipientId);
  
  await db.runTransaction(async (transaction) => {
    const senderDoc = await transaction.get(senderWalletRef);
    const recipientDoc = await transaction.get(recipientWalletRef);
    
    if (!senderDoc.exists || !recipientDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const senderWallet = senderDoc.data() as WalletData;
    const recipientWallet = recipientDoc.data() as WalletData;
    
    // CRITICAL: Validate sufficient available balance (not protected)
    validateSufficientAvailableBalance(senderWallet, amount);
    
    // Perform atomic debit and credit
    const newSenderAvailable = senderWallet.availableBalance - amount;
    const newRecipientAvailable = recipientWallet.availableBalance + amount;
    
    transaction.update(senderWalletRef, {
      availableBalance: newSenderAvailable,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    transaction.update(recipientWalletRef, {
      availableBalance: newRecipientAvailable,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Get current wallet state
 */
export async function getWallet(userId: string): Promise<WalletData | null> {
  const walletDoc = await db.collection('wallets').doc(userId).get();
  
  if (!walletDoc.exists) {
    return null;
  }
  
  return walletDoc.data() as WalletData;
}
