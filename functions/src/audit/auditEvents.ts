/**
 * PactPay - Audit Event Logger
 * 
 * Creates immutable audit events for all financial operations
 */

import * as admin from 'firebase-admin';
import { EventData, EventType } from '../types';

const db = admin.firestore();

/**
 * Create an immutable audit event
 * 
 * This function should ONLY be called from trusted server-side code.
 * Clients must NEVER be allowed to create events directly.
 */
export async function createAuditEvent(
  type: EventType,
  actorId: string,
  metadata: Record<string, any> = {},
  options: {
    paymentId?: string;
    accountId?: string;
    walletId?: string;
    previousState?: any;
    newState?: any;
  } = {}
): Promise<string> {
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  
  const eventData: EventData = {
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
export function createAuditEventsInTransaction(
  transaction: admin.firestore.Transaction,
  events: Array<{
    type: EventType;
    actorId: string;
    metadata?: Record<string, any>;
    paymentId?: string;
    accountId?: string;
    walletId?: string;
    previousState?: any;
    newState?: any;
  }>
): string[] {
  const eventIds: string[] = [];
  
  for (const event of events) {
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    eventIds.push(eventId);
    
    const eventData: EventData = {
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
export async function getPaymentEvents(paymentId: string): Promise<EventData[]> {
  const snapshot = await db.collection('events')
    .where('paymentId', '==', paymentId)
    .orderBy('timestamp', 'asc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as EventData);
}

/**
 * Get events for a specific user
 */
export async function getUserEvents(userId: string, limit: number = 50): Promise<EventData[]> {
  const snapshot = await db.collection('events')
    .where('actorId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as EventData);
}
