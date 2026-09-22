"use strict";
/**
 * PactPay - Treasury Operations
 *
 * Manages the demo treasury for issuing synthetic funds
 * ALL treasury operations MUST be server-side only
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
exports.INITIAL_TREASURY_SUPPLY = exports.INITIAL_USER_GRANT = void 0;
exports.initializeTreasury = initializeTreasury;
exports.issueDemoFunds = issueDemoFunds;
exports.markFundsIssued = markFundsIssued;
exports.checkFundsAlreadyIssued = checkFundsAlreadyIssued;
exports.getTreasuryStatus = getTreasuryStatus;
exports.validateDemoAmount = validateDemoAmount;
const admin = __importStar(require("firebase-admin"));
const types_1 = require("../types");
const auditEvents_1 = require("../audit/auditEvents");
const db = admin.firestore();
const TREASURY_DOC_ID = 'main';
const INITIAL_TREASURY_SUPPLY = 1000000000; // ₹1 billion demo supply
exports.INITIAL_TREASURY_SUPPLY = INITIAL_TREASURY_SUPPLY;
const INITIAL_USER_GRANT = 12000000; // ₹12 million per user
exports.INITIAL_USER_GRANT = INITIAL_USER_GRANT;
/**
 * Initialize or get the demo treasury
 * Called once during system setup
 */
async function initializeTreasury() {
    const treasuryRef = db.collection('treasury').doc(TREASURY_DOC_ID);
    return await db.runTransaction(async (transaction) => {
        const treasuryDoc = await transaction.get(treasuryRef);
        if (treasuryDoc.exists) {
            return treasuryDoc.data();
        }
        const now = admin.firestore.Timestamp.now();
        const initialTreasury = {
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
async function issueDemoFunds(userId, walletId, reason = 'INITIAL_GRANT') {
    const treasuryRef = db.collection('treasury').doc(TREASURY_DOC_ID);
    const walletRef = db.collection('wallets').doc(walletId);
    return await db.runTransaction(async (transaction) => {
        const treasuryDoc = await transaction.get(treasuryRef);
        if (!treasuryDoc.exists) {
            throw new Error(types_1.ERROR_CODES.TREASURY_ERROR + ': Treasury not initialized');
        }
        const treasury = treasuryDoc.data();
        // Check if we have enough supply
        if (treasury.remainingSupply < INITIAL_USER_GRANT) {
            throw new Error(types_1.ERROR_CODES.TREASURY_ERROR + ': Insufficient treasury supply');
        }
        // Get current wallet
        const walletDoc = await transaction.get(walletRef);
        if (!walletDoc.exists) {
            throw new Error('Wallet not found');
        }
        const wallet = walletDoc.data();
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
async function markFundsIssued(userId, accountId, amount) {
    const accountRef = db.collection('demoAccounts').doc(accountId);
    await accountRef.update({
        fundsIssued: true,
        issuedAmount: amount,
        issuedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Create audit event
    await (0, auditEvents_1.createAuditEvent)('DEMO_FUNDS_ISSUED', userId, {
        accountId,
        amount,
        reason: 'INITIAL_GRANT',
        treasuryDoc: TREASURY_DOC_ID,
    }, {
        accountId,
        newState: { fundsIssued: true, issuedAmount: amount },
    });
}
/**
 * Check if funds have already been issued to an account
 */
async function checkFundsAlreadyIssued(accountId) {
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
async function getTreasuryStatus() {
    const treasuryDoc = await db.collection('treasury').doc(TREASURY_DOC_ID).get();
    if (!treasuryDoc.exists) {
        return null;
    }
    return treasuryDoc.data();
}
/**
 * Validate that an amount is within acceptable demo limits
 */
function validateDemoAmount(amount) {
    // For initial grant, must be exactly the fixed amount
    // For other operations, amount should be positive and reasonable
    return Number.isInteger(amount) && amount > 0 && amount <= INITIAL_USER_GRANT;
}
//# sourceMappingURL=treasuryService.js.map