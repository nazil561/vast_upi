// Payment status states
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

// Terminal states (cannot transition out)
export const TERMINAL_STATES: PaymentStatus[] = ['RECOVERED', 'SETTLED', 'FAILED'];

// Event types for transaction history
export type PaymentEventType =
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
  | 'DEMO_ACCOUNT_CONNECTED'
  | 'DEMO_FUNDS_ISSUED';

// Account connection states
export type AccountConnectionState = 
  | 'NOT_CONNECTED'
  | 'APPLICATION_STARTED'
  | 'KYC_REQUIRED'
  | 'KYC_PENDING'
  | 'KYC_VERIFIED'
  | 'ACCOUNT_CREATED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED';

export type KycStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'DOCUMENT_SELECTED'
  | 'DOCUMENT_SUBMITTED'
  | 'VERIFICATION_PENDING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

// Demo bank information
export interface DemoBank {
  id: string;
  name: string;
  shortName: string;
  active: boolean;
  demoOnly: boolean;
}

// User document structure with account connection
export interface User {
  uid: string;
  displayName: string;
  upiId: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  kycStatus: KycStatus;
  kycDocumentType?: string;
  accountConnectionState: AccountConnectionState;
  connectedBankId?: string;
  connectedBankName?: string;
  demoAccountNumber?: string;
  demoIfsc?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// Wallet with protected balances
export interface Wallet {
  uid: string;
  availableBalance: number; // in paise (₹1 = 100 paise)
  protectedOutgoing: number;
  protectedIncoming: number;
  updatedAt: Date;
}

// Security policy for user-controlled verification
export interface SecurityPolicy {
  uid: string;
  verificationEnabled: boolean;
  verificationThreshold: number; // amount in paise that triggers verification
  verifyNewRecipient: boolean;
  verifyRecovery: boolean;
  verifySettlement: boolean;
  protectionPeriodSeconds: number;
  updatedAt: Date;
}

// Payment document structure with account info
export interface Payment {
  id: string;
  senderId: string;
  senderAccountId?: string;
  recipientId: string;
  recipientAccountId?: string;
  senderUpiId?: string;
  recipientUpiId?: string;
  amount: number; // in paise
  currency: string;
  mode: 'NORMAL' | 'PROTECTED'; // Payment mode
  description: string;
  status: PaymentStatus;
  createdAt: Date;
  expiresAt: Date;
  protectionSeconds: number;
  verificationRequired: boolean;
  verificationStatus?: 'PENDING' | 'COMPLETED' | 'FAILED';
  recipientAcknowledged: boolean;
  settlementMethod?: 'MANUAL' | 'AUTO_EXPIRY';
  createdBy: string;
  idempotencyKey?: string;
  updatedAt?: Date;
}

// Payment event for immutable history
export interface PaymentEvent {
  id: string;
  paymentId: string;
  type: PaymentEventType;
  actorId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Balance summary for UI
export interface BalanceSummary {
  availableBalance: number;
  protectedOutgoing: number;
  protectedIncoming: number;
  totalBalance: number; // available + protected incoming (for display only)
  spendableBalance: number; // same as available (protected is NOT spendable)
}

// Default security policy
export const DEFAULT_SECURITY_POLICY: Omit<SecurityPolicy, 'uid' | 'updatedAt'> = {
  verificationEnabled: true,
  verificationThreshold: 100000, // ₹1000 in paise
  verifyNewRecipient: true,
  verifyRecovery: true,
  verifySettlement: true,
  protectionPeriodSeconds: 600, // 10 minutes
};

// Demo treasury constants
export const DEMO_TREASURY_ID = 'pactpay_demo_treasury';
export const INITIAL_DEMO_BALANCE_PAISE = 1200000000; // ₹12,000,000 in paise
export const DEMO_TREASURY_INITIAL_SUPPLY = 100000000000; // ₹1,000,000,000 in paise

// Indian demo banks
export const DEMO_BANKS: DemoBank[] = [
  { id: 'sbi', name: 'State Bank of India', shortName: 'SBI', active: true, demoOnly: true },
  { id: 'hdfc', name: 'HDFC Bank', shortName: 'HDFC', active: true, demoOnly: true },
  { id: 'icici', name: 'ICICI Bank', shortName: 'ICICI', active: true, demoOnly: true },
  { id: 'axis', name: 'Axis Bank', shortName: 'Axis', active: true, demoOnly: true },
  { id: 'kotak', name: 'Kotak Mahindra Bank', shortName: 'Kotak', active: true, demoOnly: true },
  { id: 'bob', name: 'Bank of Baroda', shortName: 'BoB', active: true, demoOnly: true },
  { id: 'pnb', name: 'Punjab National Bank', shortName: 'PNB', active: true, demoOnly: true },
  { id: 'canara', name: 'Canara Bank', shortName: 'Canara', active: true, demoOnly: true },
  { id: 'union', name: 'Union Bank of India', shortName: 'Union', active: true, demoOnly: true },
  { id: 'indian', name: 'Indian Bank', shortName: 'Indian', active: true, demoOnly: true },
  { id: 'boi', name: 'Bank of India', shortName: 'BoI', active: true, demoOnly: true },
  { id: 'central', name: 'Central Bank of India', shortName: 'Central', active: true, demoOnly: true },
  { id: 'iob', name: 'Indian Overseas Bank', shortName: 'IOB', active: true, demoOnly: true },
  { id: 'uco', name: 'UCO Bank', shortName: 'UCO', active: true, demoOnly: true },
  { id: 'psb', name: 'Punjab & Sind Bank', shortName: 'PSB', active: true, demoOnly: true },
  { id: 'idbi', name: 'IDBI Bank', shortName: 'IDBI', active: true, demoOnly: true },
  { id: 'indusind', name: 'IndusInd Bank', shortName: 'IndusInd', active: true, demoOnly: true },
  { id: 'federal', name: 'Federal Bank', shortName: 'Federal', active: true, demoOnly: true },
  { id: 'rbl', name: 'RBL Bank', shortName: 'RBL', active: true, demoOnly: true },
  { id: 'yes', name: 'Yes Bank', shortName: 'Yes', active: true, demoOnly: true },
  { id: 'south_indian', name: 'South Indian Bank', shortName: 'South Indian', active: true, demoOnly: true },
  { id: 'kvb', name: 'Karur Vysya Bank', shortName: 'KVB', active: true, demoOnly: true },
  { id: 'cub', name: 'City Union Bank', shortName: 'CUB', active: true, demoOnly: true },
  { id: 'tmb', name: 'Tamilnad Mercantile Bank', shortName: 'TMB', active: true, demoOnly: true },
  { id: 'dcb', name: 'DCB Bank', shortName: 'DCB', active: true, demoOnly: true },
  { id: 'karnataka', name: 'Karnataka Bank', shortName: 'Karnataka', active: true, demoOnly: true },
  { id: 'jkb', name: 'Jammu & Kashmir Bank', shortName: 'J&K', active: true, demoOnly: true },
  { id: 'bandhan', name: 'Bandhan Bank', shortName: 'Bandhan', active: true, demoOnly: true },
  { id: 'au', name: 'AU Small Finance Bank', shortName: 'AU', active: true, demoOnly: true },
  { id: 'equitas', name: 'Equitas Small Finance Bank', shortName: 'Equitas', active: true, demoOnly: true },
  { id: 'suryoday', name: 'Suryoday Small Finance Bank', shortName: 'Suryoday', active: true, demoOnly: true },
];

// Helper to convert rupees to paise
export const toPaise = (rupees: number): number => Math.round(rupees * 100);

// Helper to convert paise to rupees
export const toRupees = (paise: number): number => paise / 100;

// Format amount for display with DEMO label
export const formatAmount = (paise: number, showDemo = true): string => {
  const rupees = toRupees(paise);
  const base = `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return showDemo ? `${base} DEMO` : base;
};

// Check if status is terminal
export const isTerminalState = (status: PaymentStatus): boolean => {
  return TERMINAL_STATES.includes(status);
};

// Validate allowed state transitions
export const isValidTransition = (from: PaymentStatus, to: PaymentStatus): boolean => {
  const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
    CREATED: ['PROTECTED'],
    PROTECTED: ['ACKNOWLEDGED', 'RECOVERED', 'SETTLED', 'EXPIRED'],
    ACKNOWLEDGED: ['RECOVERED', 'SETTLED', 'EXPIRED'],
    RECOVERY_PENDING: ['RECOVERED'],
    SETTLEMENT_PENDING: ['SETTLED'],
    EXPIRED: ['SETTLED'],
    RECOVERED: [], // Terminal
    SETTLED: [], // Terminal
    FAILED: [], // Terminal
  };
  
  return validTransitions[from]?.includes(to) || false;
};

// Generate synthetic account number
export const generateDemoAccountNumber = (): string => {
  const random = Math.floor(Math.random() * 90000000) + 10000000;
  return `XXXX XXXX ${random.toString().slice(-4)}`;
};

// Generate synthetic IFSC
export const generateDemoIfsc = (bankId: string): string => {
  const bankCode = bankId.toUpperCase().slice(0, 4).padEnd(4, 'X');
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `${bankCode}000${random}`;
};
