import { 
  collection, 
  doc, 
  getDoc, 
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { User, Wallet, SecurityPolicy, Payment, PaymentEvent, toRupees, DEMO_BANKS } from '../types';

// Collections
const USERS_COLLECTION = 'users';
const WALLETS_COLLECTION = 'wallets';
const PAYMENTS_COLLECTION = 'payments';

// ==================== USER OPERATIONS ====================

export const getUser = async (uid: string): Promise<User | null> => {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists()) {
    const data = userSnap.data();
    return {
      uid: userSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
    } as User;
  }
  
  return null;
};

export const getUserByUpiId = async (upiId: string): Promise<User | null> => {
  const searchConnectedUsers = httpsCallable(functions, 'searchConnectedUsers');
  const result = await searchConnectedUsers({ searchTerm: upiId });
  const matches = ((result.data as { data?: any[] }).data || []) as User[];
  return matches.find((user) => user.upiId.toLowerCase() === upiId.toLowerCase()) || null;
};

export const getRecipientTrustProfile = async (recipientId: string): Promise<any> => {
  const getTrustProfile = httpsCallable(functions, 'getRecipientTrustProfile');
  const result = await getTrustProfile({ recipientId });
  return (result.data as { data?: any }).data || null;
};

// Get all connected users for directory
export const getConnectedUsers = async (): Promise<User[]> => {
  const usersRef = collection(db, USERS_COLLECTION);
  const q = query(usersRef, where('accountConnectionState', '==', 'CONNECTED'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    uid: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as User[];
};

// Search users by name, UPI ID, or phone
export const searchUsers = async (searchTerm: string): Promise<User[]> => {
  const searchConnectedUsers = httpsCallable(functions, 'searchConnectedUsers');
  const result = await searchConnectedUsers({ searchTerm });
  return (((result.data as { data?: any[] }).data || []) as User[]).map((user) => ({
    ...user,
    createdAt: (user.createdAt as any)?.toDate ? (user.createdAt as any).toDate() : new Date(user.createdAt),
  }));
};

// ==================== WALLET OPERATIONS ====================

export const getWallet = async (uid: string): Promise<Wallet | null> => {
  const walletRef = doc(db, WALLETS_COLLECTION, uid);
  const walletSnap = await getDoc(walletRef);
  
  if (walletSnap.exists()) {
    const data = walletSnap.data();
    return {
      uid: walletSnap.id,
      ...data,
      updatedAt: data.updatedAt?.toDate() || new Date(),
    } as Wallet;
  }
  
  return null;
};

// ==================== ACCOUNT CONNECTION & DEMO FUNDS ====================

// Connect user's demo account and issue initial funds through the trusted backend.
export const connectDemoAccount = async (
  uid: string,
  bankId: string,
  customUpiId?: string,
  accountType: 'SAVINGS_DEMO' | 'CURRENT_DEMO' = 'SAVINGS_DEMO'
): Promise<{ user: User; wallet: Wallet }> => {
  const bank = DEMO_BANKS.find(b => b.id === bankId);
  if (!bank) {
    throw new Error('Invalid bank selected');
  }

  const connectCallable = httpsCallable(functions, 'connectDemoAccount');
  const result = await connectCallable({
    bankId,
    customUpiId: customUpiId || undefined,
    accountType,
  });

  const payload = (result as { data?: { data?: { account?: any; issuedAmount?: number } } }).data;
  const connectedUser = await getUser(uid);
  const wallet = await getWallet(uid);

  if (!connectedUser || !wallet) {
    throw new Error('Account connection completed but profile data could not be refreshed.');
  }

  return { user: connectedUser, wallet };
};

// Check if user can receive payments (must have connected account)
export const canReceivePayments = (user: User | null): boolean => {
  return user?.accountConnectionState === 'CONNECTED';
};

// Check if user can send payments (must have connected account and sufficient balance)
export const canSendPayments = async (uid: string, amountPaise: number): Promise<{ canSend: boolean; error?: string }> => {
  const [user, wallet] = await Promise.all([getUser(uid), getWallet(uid)]);
  
  if (!user || user.accountConnectionState !== 'CONNECTED') {
    return { canSend: false, error: 'Account not connected' };
  }
  
  if (!wallet) {
    return { canSend: false, error: 'Wallet not found' };
  }
  
  if (wallet.availableBalance < amountPaise) {
    return { 
      canSend: false, 
      error: `Insufficient available balance. You have ₹${toRupees(wallet.availableBalance)} DEMO available.` 
    };
  }
  
  return { canSend: true };
};

// ==================== SECURITY POLICY OPERATIONS ====================

export const getSecurityPolicy = async (uid: string): Promise<SecurityPolicy | null> => {
  const policyRef = doc(db, 'securityPolicies', uid);
  const policySnap = await getDoc(policyRef);
  
  if (policySnap.exists()) {
    const data = policySnap.data();
    return {
      uid: policySnap.id,
      ...data,
      updatedAt: data.updatedAt?.toDate() || new Date(),
    } as SecurityPolicy;
  }
  
  return null;
};

export const updateSecurityPolicy = async (uid: string, updates: Partial<SecurityPolicy>): Promise<void> => {
  const updatePolicy = httpsCallable(functions, 'updateSecurityPolicyFn');
  await updatePolicy({ ...updates, uid });
};

// ==================== PAYMENT OPERATIONS ====================

export const createPayment = async (paymentData: {
  senderId: string;
  recipientId: string;
  amount: number; // in paise
  currency: string;
  description: string;
  mode: 'NORMAL' | 'PROTECTED';
  protectionSeconds: number;
  verificationRequired?: boolean;
  recipientTrustChecked?: boolean;
  verificationConfirmed?: boolean;
  idempotencyKey?: string;
}): Promise<Payment> => {
  const createPaymentFn = httpsCallable(functions, 'createPaymentFn');
  const result = await createPaymentFn({
    recipientIdentifier: paymentData.recipientId,
    amount: paymentData.amount,
    mode: paymentData.mode,
    description: paymentData.description,
    protectionSeconds: paymentData.protectionSeconds,
    idempotencyKey: paymentData.idempotencyKey,
    recipientTrustChecked: paymentData.recipientTrustChecked,
    verificationConfirmed: paymentData.verificationConfirmed,
  });
  const data = (result.data as { data?: any }).data;
  if (!data) throw new Error('Payment service returned no payment');
  return {
    ...data,
    id: data.id || data.paymentId,
    senderId: data.senderId || data.senderUserId,
    recipientId: data.recipientId || data.recipientUserId,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
    expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt || Date.now()),
  } as Payment;
};

export const getPayment = async (paymentId: string): Promise<Payment | null> => {
  const paymentRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  const paymentSnap = await getDoc(paymentRef);
  
  if (paymentSnap.exists()) {
    const data = paymentSnap.data();
    return {
      id: paymentSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      expiresAt: data.expiresAt?.toDate() || new Date(),
    } as Payment;
  }
  
  return null;
};

export const updatePaymentStatus = async (
  paymentId: string, 
  newStatus: PaymentStatus,
  actorId: string,
  additionalData?: Record<string, any>
): Promise<void> => {
  throw new Error('Payment status changes are controlled by Cloud Functions.');
};

// ==================== PAYMENT EVENTS ====================

export const createPaymentEvent = async (
  paymentId: string,
  eventData: Omit<PaymentEvent, 'id' | 'paymentId' | 'timestamp'>
): Promise<PaymentEvent> => {
  throw new Error('Payment events are controlled by Cloud Functions.');
};

export const getPaymentEvents = async (paymentId: string): Promise<PaymentEvent[]> => {
  const eventsRef = collection(db, PAYMENTS_COLLECTION, paymentId, 'events');
  const q = query(eventsRef);
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    paymentId,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate() || new Date(),
  })) as PaymentEvent[];
};

// Execute RECOVERY through the trusted backend.
export const executeRecovery = async (
  senderId: string,
  recipientId: string,
  amount: number, // in paise
  paymentId: string
): Promise<void> => {
  const recoverPaymentFn = httpsCallable(functions, 'recoverPaymentFn');
  await recoverPaymentFn({ paymentId });
};

// Execute SETTLEMENT - convert protected funds to spendable for recipient
export const executeSettlement = async (
  senderId: string,
  recipientId: string,
  amount: number, // in paise
  paymentId: string
): Promise<void> => {
  const settlePaymentFn = httpsCallable(functions, 'settlePaymentFn');
  await settlePaymentFn({ paymentId });
};

// Acknowledge payment (recipient confirms receipt, doesn't settle)
export const acknowledgePayment = async (
  paymentId: string,
  recipientId: string
): Promise<void> => {
  const acknowledgePaymentFn = httpsCallable(functions, 'acknowledgePaymentFn');
  await acknowledgePaymentFn({ paymentId });
};

// Validate that user cannot spend more than available balance
export const validateSpendableAmount = async (
  userId: string,
  amount: number // in paise
): Promise<{ valid: boolean; error?: string }> => {
  const wallet = await getWallet(userId);
  
  if (!wallet) {
    return { valid: false, error: 'Wallet not found' };
  }
  
  // CRITICAL SECURITY RULE: Only availableBalance is spendable
  // protectedIncoming is NOT included in spendable amount
  if (amount > wallet.availableBalance) {
    return {
      valid: false,
      error: `Insufficient available balance. You have ₹${toRupees(wallet.availableBalance)} DEMO available. Protected funds (₹${toRupees(wallet.protectedIncoming)} DEMO) cannot be spent.`,
    };
  }
  
  return { valid: true };
};

// Get user's spendable balance (available only, NOT protected incoming)
export const getSpendableBalance = async (userId: string): Promise<number> => {
  const wallet = await getWallet(userId);
  return wallet?.availableBalance || 0;
};
