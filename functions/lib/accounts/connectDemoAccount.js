"use strict";
/**
 * PactPay - Account Connection Service
 *
 * Handles demo account creation and connection
 * ALL account operations MUST be server-side only
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
exports.connectDemoAccount = connectDemoAccount;
exports.completeAccountConnection = completeAccountConnection;
exports.issueInitialDemoFunds = issueInitialDemoFunds;
exports.getAccountByUserId = getAccountByUserId;
exports.isUserConnected = isUserConnected;
exports.validateAccountEligible = validateAccountEligible;
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const bankDirectory_1 = require("./bankDirectory");
const walletOperations_1 = require("./walletOperations");
const treasuryService_1 = require("../treasury/treasuryService");
const auditEvents_1 = require("../audit/auditEvents");
const db = admin.firestore();
/**
 * Generate a synthetic demo account number
 */
function generateAccountNumber() {
    const randomPart = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
    return randomPart;
}
/**
 * Generate a synthetic IFSC code
 */
function generateIFSC(bankShortName) {
    const bankPrefix = bankShortName.substring(0, 4).toUpperCase().padEnd(4, 'X');
    const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${bankPrefix}000${randomPart}`;
}
/**
 * Generate a UPI ID for the user
 */
function generateUpiId(displayName, userId) {
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
async function connectDemoAccount(userId, userData, bankId, customUpiId) {
    // Validate the bank exists and is active
    const bank = (0, bankDirectory_1.getBankById)(bankId);
    if (!bank || !bank.active) {
        throw new Error(`${types_1.ERROR_CODES.INVALID_BANK}: ${bankId}`);
    }
    const accountRef = db.collection('demoAccounts').doc(userId);
    const userRef = db.collection('users').doc(userId);
    return await db.runTransaction(async (transaction) => {
        // Check if account already exists
        const existingAccountDoc = await transaction.get(accountRef);
        if (existingAccountDoc.exists) {
            const existingAccount = existingAccountDoc.data();
            if (existingAccount.status === 'CONNECTED') {
                throw new Error(types_1.ERROR_CODES.DUPLICATE_ACCOUNT + ': Account already connected');
            }
        }
        // Get user data to verify ownership
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new Error(types_1.ERROR_CODES.USER_NOT_FOUND);
        }
        // Generate synthetic account details server-side
        const accountNumber = generateAccountNumber();
        const ifsc = generateIFSC(bank.shortName);
        const upiId = customUpiId || generateUpiId(userData.displayName, userId);
        const now = admin.firestore.Timestamp.now();
        // Create the account document with CONNECTING status first
        const newAccount = {
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
        await (0, walletOperations_1.getOrCreateWallet)(userId);
        // Return account in CONNECTING state (funds issued in separate step)
        return { ...newAccount, status: 'CONNECTING' };
    });
}
/**
 * Complete the account connection and issue demo funds
 * Called after successful account creation
 */
async function completeAccountConnection(userId, accountId) {
    const accountRef = db.collection('demoAccounts').doc(accountId);
    return await db.runTransaction(async (transaction) => {
        const accountDoc = await transaction.get(accountRef);
        if (!accountDoc.exists) {
            throw new Error('Account not found');
        }
        const account = accountDoc.data();
        // Verify ownership
        if (account.userId !== userId) {
            throw new Error(types_1.ERROR_CODES.UNAUTHORIZED_OPERATION);
        }
        // Check if already connected
        if (account.status === 'CONNECTED') {
            return account;
        }
        // Check if funds already issued
        const alreadyIssued = await (0, treasuryService_1.checkFundsAlreadyIssued)(accountId);
        if (alreadyIssued) {
            throw new Error(types_1.ERROR_CODES.DEMO_FUNDS_ALREADY_ISSUED);
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
async function issueInitialDemoFunds(userId, accountId) {
    const accountRef = db.collection('demoAccounts').doc(accountId);
    // Check if already issued (quick check before transaction)
    const alreadyIssued = await (0, treasuryService_1.checkFundsAlreadyIssued)(accountId);
    if (alreadyIssued) {
        throw new Error(types_1.ERROR_CODES.DEMO_FUNDS_ALREADY_ISSUED);
    }
    // Get wallet
    const wallet = await (0, walletOperations_1.getOrCreateWallet)(userId);
    // Issue funds from treasury
    const issuedAmount = await (0, treasuryService_1.issueDemoFunds)(userId, wallet.userId, 'INITIAL_GRANT');
    // Mark as issued
    await (0, treasuryService_1.markFundsIssued)(userId, accountId, issuedAmount);
    // Create audit event for account connection
    await (0, auditEvents_1.createAuditEvent)('DEMO_ACCOUNT_CONNECTED', userId, {
        accountId,
        bankName: (await accountRef.get()).data()?.bankName,
        upiId: (await accountRef.get()).data()?.upiId,
    }, {
        accountId,
        newState: { status: 'CONNECTED', fundsIssued: true },
    });
    return issuedAmount;
}
/**
 * Get account by user ID
 */
async function getAccountByUserId(userId) {
    const accountDoc = await db.collection('demoAccounts').doc(userId).get();
    if (!accountDoc.exists) {
        return null;
    }
    return accountDoc.data();
}
/**
 * Check if a user has a connected account
 */
async function isUserConnected(userId) {
    const account = await getAccountByUserId(userId);
    if (!account) {
        return false;
    }
    return account.status === 'CONNECTED';
}
/**
 * Validate that an account is connected and eligible for transactions
 */
async function validateAccountEligible(userId, operation) {
    const account = await getAccountByUserId(userId);
    if (!account) {
        throw new Error(types_1.ERROR_CODES.ACCOUNT_NOT_CONNECTED);
    }
    if (account.status !== 'CONNECTED') {
        throw new Error(types_1.ERROR_CODES.ACCOUNT_NOT_CONNECTED);
    }
    return account;
}
//# sourceMappingURL=connectDemoAccount.js.map