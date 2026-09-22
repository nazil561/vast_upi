"use strict";
/**
 * PactPay - Wallet Operations
 *
 * Handles all wallet balance modifications
 * ALL wallet operations MUST be server-side only
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
exports.getOrCreateWallet = getOrCreateWallet;
exports.validateSufficientAvailableBalance = validateSufficientAvailableBalance;
exports.verifyProtectedFundsNotSpent = verifyProtectedFundsNotSpent;
exports.moveAvailableToProtectedOutgoing = moveAvailableToProtectedOutgoing;
exports.creditProtectedIncoming = creditProtectedIncoming;
exports.reverseProtectedOutgoingToAvailable = reverseProtectedOutgoingToAvailable;
exports.reverseProtectedIncoming = reverseProtectedIncoming;
exports.settleProtectedIncoming = settleProtectedIncoming;
exports.settleProtectedOutgoing = settleProtectedOutgoing;
exports.performNormalTransfer = performNormalTransfer;
exports.getWallet = getWallet;
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const db = admin.firestore();
/**
 * Get or create a wallet for a user
 */
async function getOrCreateWallet(userId) {
    const walletRef = db.collection('wallets').doc(userId);
    return await db.runTransaction(async (transaction) => {
        const walletDoc = await transaction.get(walletRef);
        if (walletDoc.exists) {
            return walletDoc.data();
        }
        // Create new wallet with zero balances
        const now = admin.firestore.Timestamp.now();
        const newWallet = {
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
function validateSufficientAvailableBalance(wallet, amount) {
    if (wallet.availableBalance < amount) {
        throw new Error(`${types_1.ERROR_CODES.INSUFFICIENT_BALANCE}: Available=${wallet.availableBalance}, Requested=${amount}`);
    }
}
/**
 * CRITICAL: Verify that protected incoming funds are NOT being spent
 * This is a defense-in-depth check
 */
function verifyProtectedFundsNotSpent(wallet, requestedAmount) {
    // The spendable amount is ONLY availableBalance
    // Never: availableBalance + protectedIncoming
    const maxSpendable = wallet.availableBalance;
    if (requestedAmount > maxSpendable) {
        throw new Error(types_1.ERROR_CODES.PROTECTED_FUNDS_NOT_SPENDABLE);
    }
}
/**
 * Debit from available balance and move to protected outgoing
 * Used when creating a protected payment
 */
async function moveAvailableToProtectedOutgoing(userId, amount) {
    const walletRef = db.collection('wallets').doc(userId);
    await db.runTransaction(async (transaction) => {
        const walletDoc = await transaction.get(walletRef);
        if (!walletDoc.exists) {
            throw new Error('Wallet not found');
        }
        const wallet = walletDoc.data();
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
async function creditProtectedIncoming(userId, amount) {
    const walletRef = db.collection('wallets').doc(userId);
    await db.runTransaction(async (transaction) => {
        const walletDoc = await transaction.get(walletRef);
        if (!walletDoc.exists) {
            throw new Error('Wallet not found');
        }
        const wallet = walletDoc.data();
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
async function reverseProtectedOutgoingToAvailable(userId, amount) {
    const walletRef = db.collection('wallets').doc(userId);
    await db.runTransaction(async (transaction) => {
        const walletDoc = await transaction.get(walletRef);
        if (!walletDoc.exists) {
            throw new Error('Wallet not found');
        }
        const wallet = walletDoc.data();
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
async function reverseProtectedIncoming(userId, amount) {
    const walletRef = db.collection('wallets').doc(userId);
    await db.runTransaction(async (transaction) => {
        const walletDoc = await transaction.get(walletRef);
        if (!walletDoc.exists) {
            throw new Error('Wallet not found');
        }
        const wallet = walletDoc.data();
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
async function settleProtectedIncoming(userId, amount) {
    const walletRef = db.collection('wallets').doc(userId);
    await db.runTransaction(async (transaction) => {
        const walletDoc = await transaction.get(walletRef);
        if (!walletDoc.exists) {
            throw new Error('Wallet not found');
        }
        const wallet = walletDoc.data();
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
async function settleProtectedOutgoing(userId, amount) {
    const walletRef = db.collection('wallets').doc(userId);
    await db.runTransaction(async (transaction) => {
        const walletDoc = await transaction.get(walletRef);
        if (!walletDoc.exists) {
            throw new Error('Wallet not found');
        }
        const wallet = walletDoc.data();
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
async function performNormalTransfer(senderId, recipientId, amount) {
    const senderWalletRef = db.collection('wallets').doc(senderId);
    const recipientWalletRef = db.collection('wallets').doc(recipientId);
    await db.runTransaction(async (transaction) => {
        const senderDoc = await transaction.get(senderWalletRef);
        const recipientDoc = await transaction.get(recipientWalletRef);
        if (!senderDoc.exists || !recipientDoc.exists) {
            throw new Error('Wallet not found');
        }
        const senderWallet = senderDoc.data();
        const recipientWallet = recipientDoc.data();
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
async function getWallet(userId) {
    const walletDoc = await db.collection('wallets').doc(userId).get();
    if (!walletDoc.exists) {
        return null;
    }
    return walletDoc.data();
}
//# sourceMappingURL=walletOperations.js.map