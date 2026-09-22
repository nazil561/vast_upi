"use strict";
/**
 * PactPay - Audit Event Logger
 *
 * Creates immutable audit events for all financial operations
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
exports.createAuditEvent = createAuditEvent;
exports.createAuditEventsInTransaction = createAuditEventsInTransaction;
exports.getPaymentEvents = getPaymentEvents;
exports.getUserEvents = getUserEvents;
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Create an immutable audit event
 *
 * This function should ONLY be called from trusted server-side code.
 * Clients must NEVER be allowed to create events directly.
 */
async function createAuditEvent(type, actorId, metadata = {}, options = {}) {
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const eventData = {
        eventId,
        type,
        actorId,
        paymentId: options.paymentId,
        accountId: options.accountId,
        walletId: options.walletId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        metadata,
        previousState: options.previousState,
        newState: options.newState,
    };
    await db.collection('events').doc(eventId).set(eventData);
    return eventId;
}
/**
 * Create multiple audit events atomically within a transaction
 */
function createAuditEventsInTransaction(transaction, events) {
    const eventIds = [];
    for (const event of events) {
        const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        eventIds.push(eventId);
        const eventData = {
            eventId,
            type: event.type,
            actorId: event.actorId,
            paymentId: event.paymentId,
            accountId: event.accountId,
            walletId: event.walletId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            metadata: event.metadata || {},
            previousState: event.previousState,
            newState: event.newState,
        };
        transaction.set(db.collection('events').doc(eventId), eventData);
    }
    return eventIds;
}
/**
 * Get events for a specific payment (for reading, not writing)
 */
async function getPaymentEvents(paymentId) {
    const snapshot = await db.collection('events')
        .where('paymentId', '==', paymentId)
        .orderBy('timestamp', 'asc')
        .get();
    return snapshot.docs.map(doc => doc.data());
}
/**
 * Get events for a specific user
 */
async function getUserEvents(userId, limit = 50) {
    const snapshot = await db.collection('events')
        .where('actorId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
    return snapshot.docs.map(doc => doc.data());
}
//# sourceMappingURL=auditEvents.js.map