# PactPay Firebase setup

PactPay is a simulated payment network. It does not connect to real banks, UPI rails, or identity documents.

## Authentication

In Firebase Console, open **Authentication > Sign-in method** and enable:

- Google
- Email/password
- Phone

Under **Authentication > Settings > Authorized domains**, add:

- `nazil561.github.io`
- the local development host used by Vite, usually `localhost`

Phone authentication also requires an SMS region policy and Firebase's web reCAPTCHA flow. Test it on the deployed GitHub Pages origin before presenting it as available to judges.

## Deploy trusted code

From the repository root:

```bash
npm run build
npm --prefix functions run build
firebase deploy --only functions,firestore:rules
```

The browser only reads user-safe profile, wallet, payment and timeline data. Profile creation, KYC verification, account activation, issuance, payment creation, payment lifecycle changes, policy changes and audit events are callable Cloud Function operations.

## Demo safety

Use synthetic names, phone numbers and identity values only. The account directory and KYC screens are explicitly demo-only. The fixed initial grant is ₹12,000,000 DEMO, issued once after trusted KYC verification and account connection.
# PactPay - Firebase Setup Guide

## Prerequisites

1. Node.js 18+ installed
2. A Google account for Firebase
3. Git installed

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project" or "Create a project"
3. Enter project name: `vast-upi` (or your preferred name)
4. Follow the setup wizard
5. Enable Google Analytics (optional)

## Step 2: Register Web App in Firebase

1. In Firebase Console, click the web icon (`</>`) to add a web app
2. Register app with nickname: `PactPay Web`
3. **Copy the Firebase configuration** - you'll need this for `.env`

## Step 3: Configure Authentication

1. In Firebase Console, go to **Build > Authentication**
2. Click "Get started"
3. Enable **Email/Password** sign-in method
4. Save

## Step 4: Configure Cloud Firestore

1. In Firebase Console, go to **Build > Firestore Database**
2. Click "Create database"
3. Choose **Start in test mode** (we'll deploy security rules next)
4. Select your preferred location (e.g., `us-central`)
5. Click "Enable"

## Step 5: Deploy Security Rules

1. Install Firebase CLI if not already installed:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize Firebase in your project:
   ```bash
   firebase init firestore
   ```
   
   When prompted:
   - Use existing project: select your project
   - File to overwrite: `firestore.rules` → **No** (we have custom rules)
   - File to overwrite: `firestore.indexes.json` → Yes

4. Deploy security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

## Step 6: Configure Environment Variables

1. Copy the example env file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your Firebase config from Step 2:
   ```env
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abcdef123456
   ```

## Step 7: Install Dependencies and Run

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`

## Step 8: Build for Production

```bash
npm run build
```

Output will be in `dist/` directory.

## Step 9: Deploy to GitHub Pages

1. Install `gh-pages`:
   ```bash
   npm install --save-dev gh-pages
   ```

2. Add deploy script to `package.json`:
   ```json
   {
     "scripts": {
       "deploy": "npm run build && gh-pages -d dist"
     }
   }
   ```

3. Deploy:
   ```bash
   npm run deploy
   ```

4. In GitHub repository settings:
   - Go to Settings > Pages
   - Set source to `gh-pages` branch
   - Your app is available at `https://nazil561.github.io/vast_upi/`

## Step 10: Update Firebase Authorized Domains

1. In Firebase Console, go to **Build > Authentication > Settings**
2. Under "Authorized domains", add your GitHub Pages domain:
   - `nazil561.github.io`
3. Save

## Testing the Application

### Demo Scenario

1. **Create Alice's account:**
   - Email: `alice@example.com`
   - Password: `password123`
   - Name: `Alice Kumar`
   - UPI ID: `alice@upi`
   - Alice receives ₹10,000 demo balance

2. **Create Bob's account (in another browser/incognito):**
   - Email: `bob@example.com`
   - Password: `password123`
   - Name: `Bob Singh`
   - UPI ID: `bob@upi`
   - Bob receives ₹10,000 demo balance

3. **Test Protected Payment:**
   - As Alice, send ₹2,000 to `bob@upi`
   - Verify Alice's balance:
     - Available: ₹8,000
     - Protected Outgoing: ₹2,000
   - As Bob, check dashboard:
     - Available: ₹10,000
     - Protected Incoming: ₹2,000 (NOT SPENDABLE)

4. **Test Spendable Balance Rule:**
   - As Bob, try to send ₹12,000 to Alice
   - Should fail with "Insufficient available balance"
   - Protected funds cannot be spent

5. **Test Recovery:**
   - As Alice, go to payment details
   - Click "Recover ₹2,000"
   - Confirm recovery
   - Verify Alice's balance returns to ₹10,000
   - Verify Bob's protected incoming becomes ₹0

6. **Test Settlement:**
   - Create new protected payment
   - As Alice, click "Confirm Settlement"
   - Verify Bob's available balance increases by payment amount

## Firestore Data Structure

After creating accounts and payments, your Firestore should have:

```
users/
  {uid}/
    displayName: "Alice Kumar"
    upiId: "alice@upi"
    email: "alice@example.com"
    createdAt: Timestamp

wallets/
  {uid}/
    availableBalance: 800000 (₹8,000 in paise)
    protectedOutgoing: 200000 (₹2,000 in paise)
    protectedIncoming: 0
    updatedAt: Timestamp

securityPolicies/
  {uid}/
    verificationEnabled: true
    verificationThreshold: 100000 (₹1,000 in paise)
    verifyNewRecipient: true
    verifyRecovery: true
    verifySettlement: true
    protectionPeriodSeconds: 600
    updatedAt: Timestamp

payments/
  {paymentId}/
    senderId: "alice-uid"
    recipientId: "bob-uid"
    amount: 200000 (₹2,000 in paise)
    currency: "INR"
    description: "Protected payment"
    status: "PROTECTED"
    createdAt: Timestamp
    expiresAt: Timestamp
    protectionSeconds: 600
    verificationRequired: false
    createdBy: "alice-uid"
    
  {paymentId}/events/
    {eventId}/
      type: "PAYMENT_CREATED"
      actorId: "alice-uid"
      timestamp: Timestamp
      metadata: {...}
```

## Troubleshooting

### Build Errors
- Ensure all dependencies are installed: `npm install`
- Check TypeScript errors: `npx tsc --noEmit`

### Firebase Connection Issues
- Verify `.env` file exists and has correct values
- Check Firebase project has Authentication and Firestore enabled
- Ensure security rules are deployed

### Authentication Errors
- Verify Email/Password sign-in is enabled in Firebase Console
- Check authorized domains include your development domain

### Permission Denied Errors
- Ensure security rules are deployed correctly
- Verify user is authenticated before accessing protected routes

## Next Steps

1. Implement Firebase Cloud Functions for server-side operations (recommended for production)
2. Add automated expiry handling via scheduled Cloud Functions
3. Implement comprehensive test suite
4. Add more security policy options
5. Enhance UI/UX based on user feedback

## Important Security Notes

⚠️ **This is a PROTOTYPE/SIMULATOR:**
- Does NOT process real money
- Does NOT connect to banks or NPCI
- For educational purposes only
- Uses simplified authentication

⚠️ **For Production Use:**
- Implement proper KYC/identity verification
- Use Firebase Cloud Functions for ALL financial operations
- Add comprehensive audit logging
- Implement rate limiting
- Add fraud detection mechanisms
- Comply with local financial regulations
