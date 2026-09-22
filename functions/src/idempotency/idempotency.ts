/**
 * PactPay - Idempotency Handler
 * 
 * Prevents duplicate operations and ensures exactly-once semantics
 */

import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { IdempotencyKeyData, ERROR_CODES } from '../types';

const db = admin.firestore();

/**
 * Generate a hash of the request for idempotency comparison
 */
export function hashRequest(data: any): string {
  return createHash('sha256')
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
export async function checkIdempotency(
  userId: string,
  operation: string,
  idempotencyKey: string | undefined,
  requestData: any
): Promise<any | null> {
  if (!idempotencyKey) {
    // No idempotency key provided, proceed normally
    return null;
  }

  const idempotencyRef = db.collection('idempotency').doc(idempotencyKey);
  
  return await db.runTransaction(async (transaction) => {
    const idempotencyDoc = await transaction.get(idempotencyRef);
    
    if (idempotencyDoc.exists) {
      const existing = idempotencyDoc.data() as IdempotencyKeyData;
      
      // Verify this is the same user
      if (existing.userId !== userId) {
        throw new Error(ERROR_CODES.UNAUTHORIZED_OPERATION);
      }
      
      // Verify this is the same operation
      if (existing.operation !== operation) {
        throw new Error(ERROR_CODES.IDEMPOTENCY_CONFLICT);
      }
      
      // Verify the request data matches
      const requestHash = hashRequest(requestData);
      if (existing.requestHash !== requestHash) {
        throw new Error(ERROR_CODES.IDEMPOTENCY_CONFLICT);
      }
      
      // Same request, return cached result
      return existing.result;
    }
    
    // New request, record it (result will be filled in by caller)
    const now = admin.firestore.Timestamp.now();
    const expiresAt = new admin.firestore.Timestamp(
      Math.floor(Date.now() / 1000) + 86400, // 24 hours TTL
      0
    );
    
    const newRecord: IdempotencyKeyData = {
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
export async function updateIdempotencyResult(
  idempotencyKey: string,
  result: any
): Promise<void> {
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
export function generateIdempotencyKey(): string {
  return `auto_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}
