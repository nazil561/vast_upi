/**
 * PactPay - Treasury Operations
 * 
 * Manages the demo treasury for issuing synthetic funds
 * ALL treasury operations MUST be server-side only
 */

import * as admin from 'firebase-admin';
import { TreasuryData, ERROR_CODES } from '../types';
import { createAuditEvent } from '../audit/auditEvents';

const db = admin.firestore();
const TREASURY_DOC_ID = 'main';
const INITIAL_TREASURY_SUPPLY = 100_000_000_000; // ₹1 billion demo supply, stored in paise
const INITIAL_USER_GRANT = 1_200_000_000; // ₹12 million per user, stored in paise

/**
 * Initialize or get the demo treasury
 * Called once during system setup
 */
export async function initializeTreasury(): Promise<TreasuryData> {
  const treasuryRef = db.collection('treasury').doc(TREASURY_DOC_ID);
  
  return await db.runTransaction(async (transaction) => {
    const treasuryDoc = await transaction.get(treasuryRef);
    
    if (treasuryDoc.exists) {
      return treasuryDoc.data() as TreasuryData;
    }
    
    const now = admin.firestore.Timestamp.now();
    const initialTreasury: TreasuryData = {
      totalIssued: 0,
      remainingSupply: INITIAL_TREASURY_SUPPLY,
      currency: 'INR_DEMO',
      createdAt: now,
      updatedAt: now,
    };
    
    transaction.set(treasuryRef, initialTreasury);
    
    return initialTreasury;
  });
}

/**
 * Issue demo funds to a user's wallet
 * 
 * This is the ONLY way demo funds can be created.
 * Clients CANNOT call this directly.
 * 
 * @param userId - The user receiving funds
 * @param walletId - The user's wallet ID
 * @param reason - Reason for issuance (e.g., 'INITIAL_GRANT')
 * @returns The amount issued
 */
export async function issueDemoFunds(
  userId: string,
  walletId: string,
  reason: string = 'INITIAL_GRANT'
): Promise<number> {
  const treasuryRef = db.collection('treasury').doc(TREASURY_DOC_ID);
  const walletRef = db.collection('wallets').doc(walletId);
  
  return await db.runTransaction(async (transaction) => {
    const treasuryDoc = await transaction.get(treasuryRef);
    
    if (!treasuryDoc.exists) {
      throw new Error(ERROR_CODES.TREASURY_ERROR + ': Treasury not initialized');
    }
    
    const treasury = treasuryDoc.data() as TreasuryData;
    
    // Check if we have enough supply
    if (treasury.remainingSupply < INITIAL_USER_GRANT) {
      throw new Error(ERROR_CODES.TREASURY_ERROR + ': Insufficient treasury supply');
    }
    
    // Get current wallet
    const walletDoc = await transaction.get(walletRef);
    
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const wallet = walletDoc.data()!;
    
    // Credit the wallet
    const newAvailableBalance = (wallet.availableBalance || 0) + INITIAL_USER_GRANT;
    
    // Update treasury
    const newTotalIssued = treasury.totalIssued + INITIAL_USER_GRANT;
    const newRemainingSupply = treasury.remainingSupply - INITIAL_USER_GRANT;
    
    transaction.update(treasuryRef, {
      totalIssued: newTotalIssued,
      remainingSupply: newRemainingSupply,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    transaction.update(walletRef, {
      availableBalance: newAvailableBalance,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return INITIAL_USER_GRANT;
  });
}

/**
 * Record that funds have been issued to a user
 * This prevents duplicate issuance
 */
export async function markFundsIssued(
  userId: string,
  accountId: string,
  amount: number
): Promise<void> {
  const accountRef = db.collection('demoAccounts').doc(accountId);
  
  await accountRef.update({
    fundsIssued: true,
    issuedAmount: amount,
    issuedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  // Create audit event
  await createAuditEvent(
    'DEMO_FUNDS_ISSUED',
    userId,
    {
      accountId,
      amount,
      reason: 'INITIAL_GRANT',
      treasuryDoc: TREASURY_DOC_ID,
    },
    {
      accountId,
      newState: { fundsIssued: true, issuedAmount: amount },
    }
  );
}

/**
 * Check if funds have already been issued to an account
 */
export async function checkFundsAlreadyIssued(accountId: string): Promise<boolean> {
  const accountDoc = await db.collection('demoAccounts').doc(accountId).get();
  
  if (!accountDoc.exists) {
    return false;
  }
  
  const account = accountDoc.data();
  return account?.fundsIssued === true;
}

/**
 * Get current treasury status (for admin/demo purposes)
 */
export async function getTreasuryStatus(): Promise<TreasuryData | null> {
  const treasuryDoc = await db.collection('treasury').doc(TREASURY_DOC_ID).get();
  
  if (!treasuryDoc.exists) {
    return null;
  }
  
  return treasuryDoc.data() as TreasuryData;
}

/**
 * Validate that an amount is within acceptable demo limits
 */
export function validateDemoAmount(amount: number): boolean {
  // For initial grant, must be exactly the fixed amount
  // For other operations, amount should be positive and reasonable
  return Number.isInteger(amount) && amount > 0 && amount <= INITIAL_USER_GRANT;
}

export { INITIAL_USER_GRANT, INITIAL_TREASURY_SUPPLY };
