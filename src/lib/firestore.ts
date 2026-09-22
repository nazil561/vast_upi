import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp,
  query,
  where,
  getDocs,
  Timestamp,
  runTransaction,
  increment,
} from 'firebase/firestore';
import { db } from './firebase';
import { User, Wallet, SecurityPolicy, Payment, PaymentEvent, PaymentStatus, PaymentEventType, DEFAULT_SECURITY_POLICY, toPaise, toRupees, DEMO_BANKS, INITIAL_DEMO_BALANCE_PAISE, generateDemoAccountNumber, generateDemoIfsc, AccountConnectionState, isValidTransition } from '../types';

// Collections
const USERS_COLLECTION = 'users';
const WALLETS_COLLECTION = 'wallets';
const SECURITY_POLICIES_COLLECTION = 'securityPolicies';
const PAYMENTS_COLLECTION = 'payments';
const BANKS_COLLECTION = 'banks';
const TREASURY_COLLECTION = 'treasury';

// ==================== USER OPERATIONS ====================

export const createUser = async (uid: string, displayName: string, upiId: string, email?: string, phone?: string): Promise<User> => {
  const userRef = doc(db, USERS_COLLECTION, uid);
  const userData: User = {
    uid,
    displayName,
    upiId,
    email,
    phone,
    accountConnectionState: 'NOT_CONNECTED',
    createdAt: new Date(),
  };
  
  await setDoc(userRef, {
    ...userData,
    createdAt: serverTimestamp(),
  });
  
  return userData;
};

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
  const usersRef = collection(db, USERS_COLLECTION);
  const q = query(usersRef, where('upiId', '==', upiId.toLowerCase()));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const userSnap = snapshot.docs[0];
  const data = userSnap.data();
  return {
    uid: userSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
  } as User;
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
  const usersRef = collection(db, USERS_COLLECTION);
  const q = query(
    usersRef, 
    where('accountConnectionState', '==', 'CONNECTED')
  );
  const snapshot = await getDocs(q);
  
  const term = searchTerm.toLowerCase();
  const allUsers = snapshot.docs.map(doc => ({
    uid: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as User[];
  
  return allUsers.filter(user => 
    user.displayName.toLowerCase().includes(term) ||
    user.upiId.toLowerCase().includes(term) ||
    user.phone?.includes(term)
  );
};

// ==================== WALLET OPERATIONS ====================

export const createWallet = async (uid: string, initialBalance: number = 0): Promise<Wallet> => {
  const walletRef = doc(db, WALLETS_COLLECTION, uid);
  const walletData: Wallet = {
    uid,
    availableBalance: initialBalance * 100, // Convert rupees to paise
    protectedOutgoing: 0,
    protectedIncoming: 0,
    updatedAt: new Date(),
  };
  
  await setDoc(walletRef, {
    ...walletData,
    updatedAt: serverTimestamp(),
  });
  
  return walletData;
};

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

// Initialize wallet with demo balance if it doesn't exist
export const initializeDemoWallet = async (uid: string, initialBalance: number = 0): Promise<Wallet> => {
  const existingWallet = await getWallet(uid);
  if (existingWallet) {
    return existingWallet;
  }
  return createWallet(uid, initialBalance);
};

// ==================== ACCOUNT CONNECTION & DEMO FUNDS ====================

// Connect user's demo account and issue initial funds
export const connectDemoAccount = async (
  uid: string,
  bankId: string
): Promise<{ user: User; wallet: Wallet }> => {
  const bank = DEMO_BANKS.find(b => b.id === bankId);
  if (!bank) {
    throw new Error('Invalid bank selected');
  }

  const userRef = doc(db, USERS_COLLECTION, uid);
  const walletRef = doc(db, WALLETS_COLLECTION, uid);
  
  const accountNumber = generateDemoAccountNumber();
  const ifsc = generateDemoIfsc(bankId);
  
  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    
    if (!userSnap.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userSnap.data() as User;
    
    if (userData.accountConnectionState === 'CONNECTED') {
      throw new Error('Account already connected');
    }
    
    // Update user with account connection
    transaction.update(userRef, {
      accountConnectionState: 'CONNECTED',
      connectedBankId: bankId,
      connectedBankName: bank.name,
      demoAccountNumber: accountNumber,
      demoIfsc: ifsc,
      updatedAt: serverTimestamp(),
    });
    
    // Create or update wallet with initial demo balance
    const walletSnap = await transaction.get(walletRef);
    if (walletSnap.exists()) {
      // Wallet exists, don't overwrite
      return;
    }
    
    // Issue initial demo balance from treasury
    transaction.set(walletRef, {
      uid,
      availableBalance: INITIAL_DEMO_BALANCE_PAISE,
      protectedOutgoing: 0,
      protectedIncoming: 0,
      updatedAt: serverTimestamp(),
    });
  });
  
  // Create event for account connection and funds issuance
  const eventsRef = collection(db, 'systemEvents');
  await setDoc(doc(eventsRef), {
    type: 'DEMO_ACCOUNT_CONNECTED',
    userId: uid,
    bankId,
    timestamp: serverTimestamp(),
  });
  
  await setDoc(doc(eventsRef), {
    type: 'DEMO_FUNDS_ISSUED',
    userId: uid,
    amount: INITIAL_DEMO_BALANCE_PAISE,
    treasuryId: 'pactpay_demo_treasury',
    timestamp: serverTimestamp(),
  });
  
  // Return updated user and wallet
  const updatedUser = await getUser(uid);
  const wallet = await getWallet(uid);
  
  return { 
    user: updatedUser!, 
    wallet: wallet! 
  };
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

export const createSecurityPolicy = async (uid: string, policy?: Partial<SecurityPolicy>): Promise<SecurityPolicy> => {
  const policyRef = doc(db, SECURITY_POLICIES_COLLECTION, uid);
  const policyData: SecurityPolicy = {
    uid,
    ...DEFAULT_SECURITY_POLICY,
    ...policy,
    updatedAt: new Date(),
  } as SecurityPolicy;
  
  await setDoc(policyRef, {
    ...policyData,
    updatedAt: serverTimestamp(),
  });
  
  return policyData;
};

export const getSecurityPolicy = async (uid: string): Promise<SecurityPolicy | null> => {
  const policyRef = doc(db, SECURITY_POLICIES_COLLECTION, uid);
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
  const policyRef = doc(db, SECURITY_POLICIES_COLLECTION, uid);
  await updateDoc(policyRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
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
  idempotencyKey?: string;
}): Promise<Payment> => {
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  const paymentRef = doc(paymentsRef);
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + paymentData.protectionSeconds * 1000);
  
  const payment: Payment = {
    id: paymentRef.id,
    senderId: paymentData.senderId,
    recipientId: paymentData.recipientId,
    amount: paymentData.amount,
    currency: paymentData.currency,
    mode: paymentData.mode,
    description: paymentData.description || (paymentData.mode === 'PROTECTED' ? 'Protected payment' : 'Demo transfer'),
    status: paymentData.mode === 'PROTECTED' ? 'CREATED' : 'SETTLED',
    createdAt: now,
    expiresAt,
    protectionSeconds: paymentData.protectionSeconds,
    verificationRequired: paymentData.verificationRequired || false,
    verificationStatus: paymentData.verificationRequired ? 'PENDING' : undefined,
    recipientAcknowledged: false,
    createdBy: paymentData.senderId,
    idempotencyKey: paymentData.idempotencyKey,
  };
  
  await setDoc(paymentRef, {
    ...payment,
    createdAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt),
  });
  
  // Create initial event
  await createPaymentEvent(payment.id, {
    type: 'PAYMENT_CREATED',
    actorId: paymentData.senderId,
    metadata: {
      amount: paymentData.amount,
      mode: paymentData.mode,
    },
  });
  
  return payment;
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
  const paymentRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  const paymentSnap = await getDoc(paymentRef);
  
  if (!paymentSnap.exists()) {
    throw new Error('Payment not found');
  }
  
  const currentStatus = paymentSnap.data()?.status as PaymentStatus;
  
  // Validate state transition
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error(`Invalid state transition from ${currentStatus} to ${newStatus}`);
  }
  
  await updateDoc(paymentRef, {
    status: newStatus,
    updatedAt: serverTimestamp(),
    ...additionalData,
  });
  
  // Create event
  const eventType = `PAYMENT_${newStatus}` as PaymentEventType;
  await createPaymentEvent(paymentId, {
    type: eventType,
    actorId,
    metadata: { 
      previousStatus: currentStatus,
      newStatus,
      ...additionalData 
    },
  });
};

// ==================== PAYMENT EVENTS ====================

export const createPaymentEvent = async (
  paymentId: string,
  eventData: Omit<PaymentEvent, 'id' | 'paymentId' | 'timestamp'>
): Promise<PaymentEvent> => {
  const eventsRef = collection(db, PAYMENTS_COLLECTION, paymentId, 'events');
  const eventRef = doc(eventsRef);
  
  const event: PaymentEvent = {
    id: eventRef.id,
    paymentId,
    timestamp: new Date(),
    ...eventData,
  };
  
  await setDoc(eventRef, {
    ...event,
    timestamp: serverTimestamp(),
  });
  
  return event;
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

// ==================== ATOMIC WALLET OPERATIONS ====================

// These operations MUST be done via Firebase Functions in production
// For prototype, we use Firestore transactions

// Execute a PROTECTED payment - money moves to protected state
export const executeProtectedPayment = async (
  senderId: string,
  recipientId: string,
  amount: number, // in paise
  paymentId: string
): Promise<void> => {
  const senderWalletRef = doc(db, WALLETS_COLLECTION, senderId);
  const recipientWalletRef = doc(db, WALLETS_COLLECTION, recipientId);
  const paymentRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  
  await runTransaction(db, async (transaction) => {
    const senderSnap = await transaction.get(senderWalletRef);
    const recipientSnap = await transaction.get(recipientWalletRef);
    const paymentSnap = await transaction.get(paymentRef);
    
    if (!senderSnap.exists() || !recipientSnap.exists()) {
      throw new Error('Wallet not found');
    }
    
    if (!paymentSnap.exists()) {
      throw new Error('Payment not found');
    }
    
    const paymentData = paymentSnap.data();
    if (paymentData?.status !== 'CREATED' && paymentData?.status !== 'PROTECTED') {
      throw new Error(`Cannot protect payment in ${paymentData?.status} state`);
    }
    
    const senderWallet = senderSnap.data() as Wallet;
    const recipientWallet = recipientSnap.data() as Wallet;
    
    // CRITICAL: Check if sender has sufficient AVAILABLE balance
    if (senderWallet.availableBalance < amount) {
      throw new Error('Insufficient available balance');
    }
    
    // Update sender: decrease available, increase protected outgoing
    transaction.update(senderWalletRef, {
      availableBalance: senderWallet.availableBalance - amount,
      protectedOutgoing: senderWallet.protectedOutgoing + amount,
      updatedAt: serverTimestamp(),
    });
    
    // Update recipient: increase protected incoming (NOT available)
    transaction.update(recipientWalletRef, {
      protectedIncoming: recipientWallet.protectedIncoming + amount,
      updatedAt: serverTimestamp(),
    });
    
    // Update payment status to PROTECTED
    transaction.update(paymentRef, {
      status: 'PROTECTED',
      updatedAt: serverTimestamp(),
    });
  });
};

// Execute NORMAL instant transfer (no protection)
export const executeNormalTransfer = async (
  senderId: string,
  recipientId: string,
  amount: number, // in paise
  paymentId: string
): Promise<void> => {
  const senderWalletRef = doc(db, WALLETS_COLLECTION, senderId);
  const recipientWalletRef = doc(db, WALLETS_COLLECTION, recipientId);
  const paymentRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  
  await runTransaction(db, async (transaction) => {
    const senderSnap = await transaction.get(senderWalletRef);
    const recipientSnap = await transaction.get(recipientWalletRef);
    const paymentSnap = await transaction.get(paymentRef);
    
    if (!senderSnap.exists() || !recipientSnap.exists()) {
      throw new Error('Wallet not found');
    }
    
    if (!paymentSnap.exists()) {
      throw new Error('Payment not found');
    }
    
    const senderWallet = senderSnap.data() as Wallet;
    const recipientWallet = recipientSnap.data() as Wallet;
    
    // Check if sender has sufficient AVAILABLE balance
    if (senderWallet.availableBalance < amount) {
      throw new Error('Insufficient available balance');
    }
    
    // Direct transfer: debit sender, credit recipient
    transaction.update(senderWalletRef, {
      availableBalance: senderWallet.availableBalance - amount,
      updatedAt: serverTimestamp(),
    });
    
    transaction.update(recipientWalletRef, {
      availableBalance: recipientWallet.availableBalance + amount,
      updatedAt: serverTimestamp(),
    });
    
    // Mark payment as settled
    transaction.update(paymentRef, {
      status: 'SETTLED',
      updatedAt: serverTimestamp(),
    });
  });
};

// Execute RECOVERY - return protected funds to sender
export const executeRecovery = async (
  senderId: string,
  recipientId: string,
  amount: number, // in paise
  paymentId: string
): Promise<void> => {
  const senderWalletRef = doc(db, WALLETS_COLLECTION, senderId);
  const recipientWalletRef = doc(db, WALLETS_COLLECTION, recipientId);
  const paymentRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  
  await runTransaction(db, async (transaction) => {
    const senderSnap = await transaction.get(senderWalletRef);
    const recipientSnap = await transaction.get(recipientWalletRef);
    const paymentSnap = await transaction.get(paymentRef);
    
    if (!senderSnap.exists() || !recipientSnap.exists()) {
      throw new Error('Wallet not found');
    }
    
    if (!paymentSnap.exists()) {
      throw new Error('Payment not found');
    }
    
    const paymentData = paymentSnap.data();
    if (paymentData?.status !== 'PROTECTED' && paymentData?.status !== 'ACKNOWLEDGED') {
      throw new Error(`Cannot recover payment in ${paymentData?.status} state`);
    }
    
    const senderWallet = senderSnap.data() as Wallet;
    const recipientWallet = recipientSnap.data() as Wallet;
    
    // Verify protected balances match
    if (senderWallet.protectedOutgoing < amount) {
      throw new Error('Sender protected outgoing insufficient');
    }
    
    if (recipientWallet.protectedIncoming < amount) {
      throw new Error('Recipient protected incoming insufficient');
    }
    
    // Reverse the protection: return money to sender's available balance
    transaction.update(senderWalletRef, {
      availableBalance: senderWallet.availableBalance + amount,
      protectedOutgoing: senderWallet.protectedOutgoing - amount,
      updatedAt: serverTimestamp(),
    });
    
    // Remove from recipient's protected incoming
    transaction.update(recipientWalletRef, {
      protectedIncoming: recipientWallet.protectedIncoming - amount,
      updatedAt: serverTimestamp(),
    });
    
    // Update payment status to RECOVERED
    transaction.update(paymentRef, {
      status: 'RECOVERED',
      updatedAt: serverTimestamp(),
    });
  });
};

// Execute SETTLEMENT - convert protected funds to spendable for recipient
export const executeSettlement = async (
  senderId: string,
  recipientId: string,
  amount: number, // in paise
  paymentId: string
): Promise<void> => {
  const senderWalletRef = doc(db, WALLETS_COLLECTION, senderId);
  const recipientWalletRef = doc(db, WALLETS_COLLECTION, recipientId);
  const paymentRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  
  await runTransaction(db, async (transaction) => {
    const senderSnap = await transaction.get(senderWalletRef);
    const recipientSnap = await transaction.get(recipientWalletRef);
    const paymentSnap = await transaction.get(paymentRef);
    
    if (!senderSnap.exists() || !recipientSnap.exists()) {
      throw new Error('Wallet not found');
    }
    
    if (!paymentSnap.exists()) {
      throw new Error('Payment not found');
    }
    
    const paymentData = paymentSnap.data();
    if (paymentData?.status !== 'PROTECTED' && paymentData?.status !== 'ACKNOWLEDGED') {
      throw new Error(`Cannot settle payment in ${paymentData?.status} state`);
    }
    
    const senderWallet = senderSnap.data() as Wallet;
    const recipientWallet = recipientSnap.data() as Wallet;
    
    // Verify protected balances match
    if (senderWallet.protectedOutgoing < amount) {
      throw new Error('Sender protected outgoing insufficient');
    }
    
    if (recipientWallet.protectedIncoming < amount) {
      throw new Error('Recipient protected incoming insufficient');
    }
    
    // Settlement: remove from protected, add to recipient's available
    transaction.update(senderWalletRef, {
      protectedOutgoing: senderWallet.protectedOutgoing - amount,
      updatedAt: serverTimestamp(),
    });
    
    transaction.update(recipientWalletRef, {
      protectedIncoming: recipientWallet.protectedIncoming - amount,
      availableBalance: recipientWallet.availableBalance + amount,
      updatedAt: serverTimestamp(),
    });
    
    // Update payment status to SETTLED
    transaction.update(paymentRef, {
      status: 'SETTLED',
      settlementMethod: 'MANUAL',
      updatedAt: serverTimestamp(),
    });
  });
};

// Acknowledge payment (recipient confirms receipt, doesn't settle)
export const acknowledgePayment = async (
  paymentId: string,
  recipientId: string
): Promise<void> => {
  const paymentRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  const paymentSnap = await getDoc(paymentRef);
  
  if (!paymentSnap.exists()) {
    throw new Error('Payment not found');
  }
  
  const paymentData = paymentSnap.data();
  if (paymentData?.recipientId !== recipientId) {
    throw new Error('Unauthorized: only recipient can acknowledge');
  }
  
  if (paymentData?.status !== 'PROTECTED') {
    throw new Error(`Cannot acknowledge payment in ${paymentData?.status} state`);
  }
  
  await updateDoc(paymentRef, {
    recipientAcknowledged: true,
    status: 'ACKNOWLEDGED',
    updatedAt: serverTimestamp(),
  });
  
  await createPaymentEvent(paymentId, {
    type: 'PAYMENT_ACKNOWLEDGED',
    actorId: recipientId,
    metadata: {},
  });
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
