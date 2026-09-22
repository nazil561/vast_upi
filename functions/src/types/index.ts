/**
 * PactPay - Shared Type Definitions
 * 
 * These types are shared between Cloud Functions and frontend
 */

// User Types
export interface UserData {
  uid: string;
  displayName: string;
  phoneNumber: string;
  upiId?: string;
  createdAt: any; // Firestore timestamp
}

// Account Types
export type AccountStatus = 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

export interface DemoAccountData {
  userId: string;
  bankId: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
  holderName: string;
  mobile: string;
  status: AccountStatus;
  fundsIssued: boolean;
  createdAt: any;
  connectedAt?: any;
}

// Wallet Types
export interface WalletData {
  userId: string;
  availableBalance: number;
  protectedIncoming: number;
  protectedOutgoing: number;
  currency: string;
  updatedAt: any;
}

// Payment Types
export type PaymentMode = 'NORMAL' | 'PROTECTED';
export type PaymentStatus = 
  | 'CREATED'
  | 'PROTECTED'
  | 'ACKNOWLEDGED'
  | 'RECOVERY_PENDING'
  | 'SETTLEMENT_PENDING'
  | 'RECOVERED'
  | 'SETTLED'
  | 'EXPIRED'
  | 'FAILED';

export interface PaymentData {
  paymentId: string;
  senderUserId: string;
  senderAccountId: string;
  recipientUserId: string;
  recipientAccountId: string;
  senderUpiId: string;
  recipientUpiId: string;
  amount: number;
  currency: string;
  mode: PaymentMode;
  status: PaymentStatus;
  description?: string;
  createdAt: any;
  expiresAt?: any;
  protectionSeconds?: number;
  verificationRequired: boolean;
  verificationStatus?: 'PENDING' | 'COMPLETED' | 'FAILED';
  recipientAcknowledged: boolean;
  settlementMethod?: 'MANUAL' | 'AUTO_EXPIRY';
  idempotencyKey?: string;
  createdBy: string;
  updatedAt: any;
}

// Event Types
export type EventType =
  | 'DEMO_ACCOUNT_CONNECTED'
  | 'DEMO_FUNDS_ISSUED'
  | 'PAYMENT_CREATED'
  | 'PAYMENT_AUTHORIZATION_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'VERIFICATION_COMPLETED'
  | 'VERIFICATION_FAILED'
  | 'PAYMENT_PROTECTED'
  | 'PAYMENT_ACKNOWLEDGED'
  | 'RECOVERY_REQUESTED'
  | 'PAYMENT_RECOVERED'
  | 'SETTLEMENT_REQUESTED'
  | 'PAYMENT_SETTLED'
  | 'PAYMENT_EXPIRED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REJECTED';

export interface EventData {
  eventId: string;
  type: EventType;
  actorId: string;
  paymentId?: string;
  accountId?: string;
  walletId?: string;
  timestamp: any;
  metadata: Record<string, any>;
  previousState?: any;
  newState?: any;
}

// Treasury Types
export interface TreasuryData {
  totalIssued: number;
  remainingSupply: number;
  currency: string;
  createdAt: any;
  updatedAt: any;
}

// Idempotency Types
export interface IdempotencyKeyData {
  key: string;
  userId: string;
  operation: string;
  requestHash: string;
  result?: any;
  createdAt: any;
  expiresAt: any;
}

// Security Policy Types
export interface SecurityPolicyData {
  userId: string;
  verificationEnabled: boolean;
  verificationThreshold: number;
  verifyNewRecipient: boolean;
  verifyRecovery: boolean;
  verifySettlement: boolean;
  protectionPeriodSeconds: number;
  createdAt: any;
  updatedAt: any;
}

// Bank Directory Types
export interface BankData {
  bankId: string;
  name: string;
  shortName: string;
  logoPlaceholder?: string;
  active: boolean;
  demoOnly: boolean;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Error Codes
export const ERROR_CODES = {
  ACCOUNT_NOT_CONNECTED: 'ACCOUNT_NOT_CONNECTED',
  RECIPIENT_NOT_CONNECTED: 'RECIPIENT_NOT_CONNECTED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  PROTECTED_FUNDS_NOT_SPENDABLE: 'PROTECTED_FUNDS_NOT_SPENDABLE',
  INVALID_PAYMENT_STATE: 'INVALID_PAYMENT_STATE',
  PAYMENT_ALREADY_SETTLED: 'PAYMENT_ALREADY_SETTLED',
  PAYMENT_ALREADY_RECOVERED: 'PAYMENT_ALREADY_RECOVERED',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  VERIFICATION_REQUIRED: 'VERIFICATION_REQUIRED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  UNAUTHORIZED_OPERATION: 'UNAUTHORIZED_OPERATION',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  DEMO_FUNDS_ALREADY_ISSUED: 'DEMO_FUNDS_ALREADY_ISSUED',
  TREASURY_ERROR: 'TREASURY_ERROR',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  DUPLICATE_ACCOUNT: 'DUPLICATE_ACCOUNT',
  INVALID_BANK: 'INVALID_BANK',
} as const;
