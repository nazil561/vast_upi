# PactPay - Firebase-Powered Conditional Settlement Payment System

## ⚠️ IMPORTANT: DEMO/SIMULATOR ONLY

**This is a SIMULATED payment system for educational and portfolio purposes:**
- ❌ NOT real UPI
- ❌ Does NOT connect to banks or NPCI infrastructure  
- ❌ Does NOT process real money
- ✅ For demonstration and learning only

## Core Innovation: Protected Payments

PactPay introduces a **protected payment state** between initiation and final settlement, giving senders control over their funds until confirmation.

### The Problem with Traditional Payments

Traditional payment systems settle immediately:
```
Alice sends ₹2,000 → Bob receives ₹2,000 instantly
```

Once sent, the sender cannot recover the funds even if:
- The recipient is fraudulent
- The goods/services were not delivered
- The transaction was a mistake

### PactPay Solution: Conditional Settlement

```
Alice sends ₹2,000 to Bob
↓
Payment enters PROTECTED state (10 minutes default)
↓
Alice balance:
  available: ₹8,000
  protected outgoing: ₹2,000

Bob balance:
  available: ₹5,000
  protected incoming: ₹2,000 (NOT SPENDABLE!)
```

During the protection period:
1. **Alice can RECOVER** → Money returns to Alice
2. **Alice can CONFIRM settlement** → Money becomes spendable by Bob
3. **Auto-settlement** → If Alice does nothing, settles at expiry

### CRITICAL SECURITY INVARIANT

**PROTECTED MONEY MUST NEVER BE SPENDABLE.**

This is enforced at the backend ledger level—not just as a UI restriction.

## Payment State Machine

```
CREATED → PROTECTED

PROTECTED → ACKNOWLEDGED (recipient confirms receipt)
PROTECTED → RECOVERED (terminal - sender recovers funds)
PROTECTED → SETTLED (terminal - funds transferred)
PROTECTED → EXPIRED

ACKNOWLEDGED → RECOVERED (terminal)
ACKNOWLEDGED → SETTLED (terminal)
ACKNOWLEDGED → EXPIRED

EXPIRED → SETTLED (terminal)
```

**Terminal States:** `RECOVERED`, `SETTLED`

Once terminal, a payment cannot change state again.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Firebase Authentication, Cloud Firestore
- **Hosting**: GitHub Pages (static build)
- **Styling**: Custom CSS (mobile-responsive)

## Architecture

```
┌─────────────────┐
│  GitHub Pages   │
│  (Static HTML)  │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Firebase Auth   │
│  (Identity)     │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Cloud Firestore │
│  (Database)     │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Transactions    │
│  (Atomic Ops)   │
└─────────────────┘
```

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/nazil561/vast_upi.git
cd vast_upi
npm install
```

### 2. Configure Firebase

The Firebase configuration is already set in `src/lib/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "AIzaSyDXUBNOqqcCLU0hL2nymyFNYJAdYeRdHt0",
  authDomain: "vast-upi.firebaseapp.com",
  projectId: "vast-upi",
  storageBucket: "vast-upi.firebasestorage.app",
  messagingSenderId: "1069876017620",
  appId: "1:1069876017620:web:3d11f1ef44fe19ce757e41",
  measurementId: "G-GPP1888ECP"
};
```

### 3. Setup Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project: `vast-upi`
3. Enable **Authentication** → Email/Password provider
4. Enable **Cloud Firestore** database
5. Deploy **Firestore Security Rules** (see `firestore.rules`)

### 4. Run Development Server

```bash
npm run dev
```

### 5. Build for Production

```bash
npm run build
```

Output in `dist/` directory, ready for GitHub Pages deployment.

## User Journey

### Step 1: Registration
- User creates account with email, password, name, UPI ID
- Initial balance: ₹0 (account not connected)

### Step 2: Account Connection
- User selects a demo bank from Indian bank directory
- System creates synthetic demo account
- User receives ₹12,000,000 DEMO balance

### Step 3: Send Protected Payment
- Sender enters recipient UPI ID
- Enters amount and selects protection period
- Two-step verification if amount exceeds threshold
- Payment enters PROTECTED state

### Step 4: Recipient View
- Recipient sees payment notification
- Can acknowledge receipt (doesn't settle)
- **Cannot spend protected funds**

### Step 5: Sender Decision
- **Recover**: Get funds back (before expiry)
- **Settle**: Release funds to recipient
- **Wait**: Auto-settle at expiry

## Demo Scenario

### Setup
```
Alice: HDFC Bank, ₹12,000,000 DEMO
Bob: SBI Bank, ₹12,000,000 DEMO
```

### Protected Payment Flow

1. **Alice sends ₹2,000 to Bob (protected)**
   ```
   Alice: available ₹11,998,000, protected outgoing ₹2,000
   Bob: available ₹12,000,000, protected incoming ₹2,000
   ```

2. **Bob tries to send ₹6,000** → REJECTED
   ```
   Error: Insufficient available balance
   Bob only has ₹12,000,000 available (protected ₹2,000 not spendable)
   ```

3. **Alice recovers the payment**
   ```
   Alice: available ₹12,000,000, protected outgoing ₹0
   Bob: available ₹12,000,000, protected incoming ₹0
   ```

4. **Alternative: Alice confirms settlement**
   ```
   Alice: available ₹11,998,000, protected outgoing ₹0
   Bob: available ₹12,002,000, protected incoming ₹0
   ```

## Security Features

### Backend Enforcement
- Protected balances cannot be spent (server-side validation)
- State transitions validated against state machine
- Atomic transactions prevent race conditions
- Idempotency keys prevent duplicate operations

### User-Controlled Verification
```typescript
{
  verificationEnabled: true,
  verificationThreshold: 1000,  // ₹1000
  verifyNewRecipient: true,
  verifyRecovery: true,
  verifySettlement: true
}
```

### Firestore Security Rules
- Clients cannot directly modify wallet balances
- Payment status updates require trusted backend
- Event logs are append-only
- Users can only read their own data

## Deployment to GitHub Pages

```bash
# Build production bundle
npm run build

# Deploy to gh-pages branch
npm run deploy
```

Configure Firebase Authentication for your GitHub Pages domain in Firebase Console.

## License

MIT License - See LICENSE file

---

**Remember**: This is a DEMONSTRATION SYSTEM. No real money moves. No real bank connections exist. All balances are synthetic demo values.
