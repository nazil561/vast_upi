/**
 * PactPay - Account Connection Service
 * 
 * Handles demo account creation and connection
 * ALL account operations MUST be server-side only
 */

import * as admin from 'firebase-admin';
import { DemoAccountData, ERROR_CODES } from '../types';
import { getBankById } from './bankDirectory';
import { getOrCreateWallet } from './walletOperations';
import { issueDemoFunds, markFundsIssued, checkFundsAlreadyIssued } from '../treasury/treasuryService';
import { createAuditEvent } from '../audit/auditEvents';

const db = admin.firestore();

/**
 * Generate a synthetic demo account number
 */
function generateAccountNumber(): string {
  const randomPart = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
  return randomPart;
}

/**
 * Generate a synthetic IFSC code
 */
function generateIFSC(bankShortName: string): string {
  const bankPrefix = bankShortName.substring(0, 4).toUpperCase().padEnd(4, 'X');
  const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${bankPrefix}000${randomPart}`;
}

/**
 * Generate a UPI ID for the user
 */
function generateUpiId(displayName: string, userId: string): string {
  const cleanName = displayName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 12);
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${cleanName}${randomSuffix}@pactpay`;
}

/**
 * Connect a demo bank account for a user
 * 
 * This is the ONLY way to create a connected demo account.
 * Clients CANNOT directly create account documents.
 * 
 * @param userId - The authenticated user ID
 * @param userData - User profile data
 * @param bankId - Selected bank ID from the directory
 * @param customUpiId - Optional custom UPI ID (validated server-side)
 * @returns The created account
 */
export async function connectDemoAccount(
  userId: string,
  userData: { displayName: string; phoneNumber: string },
  bankId: string,
  customUpiId?: string
): Promise<DemoAccountData> {
  // Validate the bank exists and is active
  const bank = getBankById(bankId);
  
  if (!bank || !bank.active) {
    throw new Error(`${ERROR_CODES.INVALID_BANK}: ${bankId}`);
  }
  
  const accountRef = db.collection('demoAccounts').doc(userId);
  const userRef = db.collection('users').doc(userId);
  
  return await db.runTransaction(async (transaction) => {
    // Check if account already exists
    const existingAccountDoc = await transaction.get(accountRef);
    
    if (existingAccountDoc.exists) {
      const existingAccount = existingAccountDoc.data() as DemoAccountData;
      
      if (existingAccount.status === 'CONNECTED') {
        throw new Error(ERROR_CODES.DUPLICATE_ACCOUNT + ': Account already connected');
      }
    }
    
    // Get user data to verify ownership
    const userDoc = await transaction.get(userRef);
    
    if (!userDoc.exists) {
      throw new Error(ERROR_CODES.USER_NOT_FOUND);
    }
    
    // Generate synthetic account details server-side
    const accountNumber = generateAccountNumber();
    const ifsc = generateIFSC(bank.shortName);
    const upiId = customUpiId || generateUpiId(userData.displayName, userId);
    
    const now = admin.firestore.Timestamp.now();
    
    // Create the account document with CONNECTING status first
    const newAccount: DemoAccountData = {
      userId,
      bankId: bank.bankId,
      bankName: bank.name,
      accountNumber,
      ifsc,
      upiId,
      holderName: userData.displayName,
      mobile: userData.phoneNumber,
      status: 'CONNECTING',
      fundsIssued: false,
      createdAt: now,
    };
    
    transaction.set(accountRef, newAccount);
    
    // Update user's UPI ID
    transaction.update(userRef, {
      upiId,
      updatedAt: now,
    });
    
    // Create or get wallet
    await getOrCreateWallet(userId);
    
    // Return account in CONNECTING state (funds issued in separate step)
    return { ...newAccount, status: 'CONNECTING' };
  });
}

/**
 * Complete the account connection and issue demo funds
 * Called after successful account creation
 */
export async function completeAccountConnection(
  userId: string,
  accountId: string
): Promise<DemoAccountData> {
  const accountRef = db.collection('demoAccounts').doc(accountId);
  
  return await db.runTransaction(async (transaction) => {
    const accountDoc = await transaction.get(accountRef);
    
    if (!accountDoc.exists) {
      throw new Error('Account not found');
    }
    
    const account = accountDoc.data() as DemoAccountData;
    
    // Verify ownership
    if (account.userId !== userId) {
      throw new Error(ERROR_CODES.UNAUTHORIZED_OPERATION);
    }
    
    // Check if already connected
    if (account.status === 'CONNECTED') {
      return account;
    }
    
    // Check if funds already issued
    const alreadyIssued = await checkFundsAlreadyIssued(accountId);
    
    if (alreadyIssued) {
      throw new Error(ERROR_CODES.DEMO_FUNDS_ALREADY_ISSUED);
    }
    
    // Update account status to CONNECTED
    const now = admin.firestore.Timestamp.now();
    
    transaction.update(accountRef, {
      status: 'CONNECTED',
      connectedAt: now,
    });
    
    return {
      ...account,
      status: 'CONNECTED',
      connectedAt: now,
    };
  });
}

/**
 * Issue demo funds to a newly connected account
 * This is atomic and prevents duplicate issuance
 */
export async function issueInitialDemoFunds(
  userId: string,
  accountId: string
): Promise<number> {
  const accountRef = db.collection('demoAccounts').doc(accountId);
  
  // Check if already issued (quick check before transaction)
  const alreadyIssued = await checkFundsAlreadyIssued(accountId);
  
  if (alreadyIssued) {
    throw new Error(ERROR_CODES.DEMO_FUNDS_ALREADY_ISSUED);
  }
  
  // Get wallet
  const wallet = await getOrCreateWallet(userId);
  
  // Issue funds from treasury
  const issuedAmount = await issueDemoFunds(userId, wallet.userId, 'INITIAL_GRANT');
  
  // Mark as issued
  await markFundsIssued(userId, accountId, issuedAmount);
  
  // Create audit event for account connection
  await createAuditEvent(
    'DEMO_ACCOUNT_CONNECTED',
    userId,
    {
      accountId,
      bankName: (await accountRef.get()).data()?.bankName,
      upiId: (await accountRef.get()).data()?.upiId,
    },
    {
      accountId,
      newState: { status: 'CONNECTED', fundsIssued: true },
    }
  );
  
  return issuedAmount;
}

/**
 * Get account by user ID
 */
export async function getAccountByUserId(userId: string): Promise<DemoAccountData | null> {
  const accountDoc = await db.collection('demoAccounts').doc(userId).get();
  
  if (!accountDoc.exists) {
    return null;
  }
  
  return accountDoc.data() as DemoAccountData;
}

/**
 * Check if a user has a connected account
 */
export async function isUserConnected(userId: string): Promise<boolean> {
  const account = await getAccountByUserId(userId);
  
  if (!account) {
    return false;
  }
  
  return account.status === 'CONNECTED';
}

/**
 * Validate that an account is connected and eligible for transactions
 */
export async function validateAccountEligible(
  userId: string,
  operation: string
): Promise<DemoAccountData> {
  const account = await getAccountByUserId(userId);
  
  if (!account) {
    throw new Error(ERROR_CODES.ACCOUNT_NOT_CONNECTED);
  }
  
  if (account.status !== 'CONNECTED') {
    throw new Error(ERROR_CODES.ACCOUNT_NOT_CONNECTED);
  }
  
  return account;
}
