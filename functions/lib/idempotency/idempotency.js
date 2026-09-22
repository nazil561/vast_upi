"use strict";
/**
 * PactPay - Idempotency Handler
 *
 * Prevents duplicate operations and ensures exactly-once semantics
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
exports.hashRequest = hashRequest;
exports.checkIdempotency = checkIdempotency;
exports.updateIdempotencyResult = updateIdempotencyResult;
exports.generateIdempotencyKey = generateIdempotencyKey;
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const types_1 = require("../types");
const db = admin.firestore();
/**
 * Generate a hash of the request for idempotency comparison
 */
function hashRequest(data) {
    return (0, crypto_1.createHash)('sha256')
        .update(JSON.stringify(data))
        .digest('hex');
}
/**
 * Check and record idempotency key
 *
 * @param userId - The authenticated user ID
 * @param operation - The operation type (e.g., 'createPayment', 'recoverPayment')
 * @param idempotencyKey - Client-provided idempotency key
 * @param requestData - The request data to hash
 * @returns Promise resolving to existing result if duplicate, or null if new
 * @throws Error with IDEMPOTENCY_CONFLICT if same key used with different data
 */
async function checkIdempotency(userId, operation, idempotencyKey, requestData) {
    if (!idempotencyKey) {
        // No idempotency key provided, proceed normally
        return null;
    }
    const idempotencyRef = db.collection('idempotency').doc(idempotencyKey);
    return await db.runTransaction(async (transaction) => {
        const idempotencyDoc = await transaction.get(idempotencyRef);
        if (idempotencyDoc.exists) {
            const existing = idempotencyDoc.data();
            // Verify this is the same user
            if (existing.userId !== userId) {
                throw new Error(types_1.ERROR_CODES.UNAUTHORIZED_OPERATION);
            }
            // Verify this is the same operation
            if (existing.operation !== operation) {
                throw new Error(types_1.ERROR_CODES.IDEMPOTENCY_CONFLICT);
            }
            // Verify the request data matches
            const requestHash = hashRequest(requestData);
            if (existing.requestHash !== requestHash) {
                throw new Error(types_1.ERROR_CODES.IDEMPOTENCY_CONFLICT);
            }
            // Same request, return cached result
            return existing.result;
        }
        // New request, record it (result will be filled in by caller)
        const now = admin.firestore.Timestamp.now();
        const expiresAt = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 86400, // 24 hours TTL
        0);
        const newRecord = {
            key: idempotencyKey,
            userId,
            operation,
            requestHash: hashRequest(requestData),
            createdAt: now,
            expiresAt,
        };
        transaction.set(idempotencyRef, newRecord);
        return null;
    });
}
/**
 * Update idempotency record with the result
 */
async function updateIdempotencyResult(idempotencyKey, result) {
    if (!idempotencyKey) {
        return;
    }
    await db.collection('idempotency').doc(idempotencyKey).update({
        result,
    });
}
/**
 * Generate a unique idempotency key if client didn't provide one
 */
function generateIdempotencyKey() {
    return `auto_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}
//# sourceMappingURL=idempotency.js.map