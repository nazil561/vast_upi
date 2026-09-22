import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  createPayment, 
  getUserByUpiId, 
  getRecipientTrustProfile,
  validateSpendableAmount,
} from '../lib/firestore';
import { User, Payment, toPaise, formatAmount, DEFAULT_SECURITY_POLICY } from '../types';

const SendPaymentPage = () => {
  const navigate = useNavigate();
  const { user, wallet, securityPolicy, refreshUserData } = useAuth();
  
  const [recipientUpiId, setRecipientUpiId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [protectionSeconds, setProtectionSeconds] = useState('600');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationStep, setVerificationStep] = useState(false);
  const [recipient, setRecipient] = useState<User | null>(null);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<any>(null);
  const [trustProfile, setTrustProfile] = useState<any>(null);
  const [trustChecked, setTrustChecked] = useState(false);
  const [trustLoading, setTrustLoading] = useState(false);
  const [mode, setMode] = useState<'NORMAL' | 'PROTECTED'>('PROTECTED');

  // Check if verification is required based on user's policy
  const checkVerificationRequired = (amountPaise: number, isnewRecipient: boolean): boolean => {
    const policy = securityPolicy || DEFAULT_SECURITY_POLICY;
    
    if (!policy.verificationEnabled) {
      return false;
    }

    // Check amount threshold
    if (amountPaise >= policy.verificationThreshold) {
      return true;
    }

    // Check new recipient
    if (policy.verifyNewRecipient && isnewRecipient) {
      return true;
    }

    return false;
  };

  const handleLookupRecipient = async () => {
    if (!recipientUpiId.trim()) {
      setError('Please enter a UPI ID');
      return;
    }

    try {
      const foundUser = await getUserByUpiId(recipientUpiId.trim());
      if (!foundUser) {
        setError('User not found. Please check the UPI ID.');
        setRecipient(null);
      } else if (foundUser.uid === user?.uid) {
        setError('Cannot send payment to yourself');
        setRecipient(null);
      } else {
        setRecipient(foundUser);
        setTrustLoading(true);
        try {
          const profile = await getRecipientTrustProfile(foundUser.uid);
          setTrustProfile(profile);
          setTrustChecked(false);
          setError(profile?.available === false ? 'Recipient verification profile unavailable.' : 'Review the recipient profile before continuing.');
        } finally {
          setTrustLoading(false);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error looking up recipient');
    }
  };

  const handleInitiatePayment = async () => {
    setError('');

    if (!recipient) {
      setError('Please look up recipient first');
      return;
    }

    if (!trustProfile?.available || !trustChecked) {
      setError('Review and confirm the Recipient Trust Check before continuing.');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    const amountPaise = toPaise(amountNum);

    // Validate spendable balance (CRITICAL: protected incoming is NOT spendable)
    const validation = await validateSpendableAmount(user!.uid, amountPaise);
    if (!validation.valid) {
      setError(validation.error || 'Insufficient balance');
      return;
    }

    // Check if verification is required
    const needsVerification = checkVerificationRequired(amountPaise, true);
    setRequiresVerification(needsVerification);

    if (needsVerification) {
      // Store pending data for verification step
      setPendingPaymentData({
        recipient,
        amountPaise,
        amountRupees: amountNum,
        description,
        protectionSeconds: parseInt(protectionSeconds),
        mode,
      });
      setVerificationStep(true);
    } else {
      // Direct payment without verification
      await executePayment(recipient.uid, amountPaise, amountNum, description, parseInt(protectionSeconds), mode);
    }
  };

  const executePayment = async (
    recipientId: string,
    amountPaise: number,
    amountRupees: number,
    desc: string,
    protectionSecs: number,
    paymentMode: 'NORMAL' | 'PROTECTED'
  ) => {
    setLoading(true);
    setError('');

    try {
      // Generate idempotency key
      const idempotencyKey = `${user!.uid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // The callable function validates the recipient, debits the ledger, and records events atomically.
      const payment = await createPayment({
        senderId: user!.uid,
        recipientId,
        amount: amountPaise,
        currency: 'INR',
        description: desc || 'Protected payment',
        mode: paymentMode,
        protectionSeconds: protectionSecs,
        idempotencyKey,
        recipientTrustChecked: true,
        verificationConfirmed: true,
      });

      // Refresh wallet data
      await refreshUserData();

      navigate(`/payment/${payment.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create payment');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmVerification = () => {
    if (pendingPaymentData) {
      executePayment(
        pendingPaymentData.recipient.uid,
        pendingPaymentData.amountPaise,
        pendingPaymentData.amountRupees,
        pendingPaymentData.description,
        pendingPaymentData.protectionSeconds
        , pendingPaymentData.mode
      );
    }
  };

  const handleCancelVerification = () => {
    setVerificationStep(false);
    setPendingPaymentData(null);
  };

  if (verificationStep && pendingPaymentData) {
    return (
      <div className="page-container">
        <div className="verification-screen">
          <h2>Verify Payment</h2>
          
          <div className="verification-details">
            <div className="detail-row">
              <span className="label">Amount:</span>
              <span className="value highlight">{formatAmount(pendingPaymentData.amountPaise)}</span>
            </div>
            
            <div className="detail-row">
              <span className="label">To:</span>
              <span className="value">{pendingPaymentData.recipient.displayName}</span>
            </div>
            
            <div className="detail-row">
              <span className="label">UPI ID:</span>
              <span className="value">{pendingPaymentData.recipient.upiId}</span>
            </div>
            
            <div className="detail-row">
              <span className="label">Description:</span>
              <span className="value">{pendingPaymentData.description || 'Protected payment'}</span>
            </div>
            
            <div className="detail-row">
              <span className="label">Protection Period:</span>
              <span className="value">{pendingPaymentData.protectionSeconds / 60} minutes</span>
            </div>
            
            <div className="detail-row">
              <span className="label">Expires At:</span>
              <span className="value">
                {new Date(Date.now() + pendingPaymentData.protectionSeconds * 1000).toLocaleString()}
              </span>
            </div>
            
            <div className="verification-notice">
              <strong>⚠️ Verification Required</strong>
              <p>This payment requires additional verification because the amount exceeds your configured threshold.</p>
              <p>After confirmation, the payment will be in PROTECTED state. You can recover it before expiry or confirm settlement.</p>
              <p><strong>The recipient CANNOT spend this money until you confirm settlement or the protection period expires.</strong></p>
            </div>
          </div>
          
          <div className="verification-actions">
            <button onClick={handleCancelVerification} className="btn-secondary" disabled={loading}>
              Cancel
            </button>
            <button onClick={handleConfirmVerification} className="btn-primary" disabled={loading}>
              {loading ? 'Processing...' : 'Confirm Payment'}
            </button>
          </div>
          
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="form-page">
        <h2>Send Protected Payment</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <div className="balance-info">
          <div className="balance-item">
            <span className="label">Available Balance:</span>
            <span className="value">{wallet ? formatAmount(wallet.availableBalance) : 'Loading...'}</span>
          </div>
          <small>Only available balance can be sent. Protected incoming funds are NOT spendable.</small>
        </div>
        
        <div className="form-group">
          <label htmlFor="recipientUpiId">Recipient UPI ID</label>
          <div className="input-with-button">
            <input
              type="text"
              id="recipientUpiId"
              value={recipientUpiId}
              onChange={(e) => setRecipientUpiId(e.target.value.toLowerCase())}
              placeholder="bob@upi"
              disabled={!!recipient}
            />
            {!recipient && (
              <button 
                type="button" 
                onClick={handleLookupRecipient}
                className="btn-secondary"
                disabled={loading}
              >
                Look Up
              </button>
            )}
          </div>
        </div>
        
        {recipient && (
          <div className="recipient-info">
            <strong>Recipient:</strong> {recipient.displayName} ({recipient.upiId})
            <button 
              type="button" 
              onClick={() => setRecipient(null)}
              className="btn-link"
            >
              Change
            </button>
          </div>
        )}

        {trustLoading && <div className="info-box">Loading recipient trust profile...</div>}

        {trustProfile?.available && recipient && (
          <div className="trust-card">
            <div className="trust-card-heading">
              <div>
                <p className="eyebrow">RECIPIENT TRUST CHECK</p>
                <h3>Verify recipient</h3>
              </div>
              <span className="demo-pill">CONSENTED DEMO DATA</span>
            </div>
            <div className="trust-person">
              <div className="avatar-circle">{recipient.displayName.slice(0, 1).toUpperCase()}</div>
              <div><strong>{trustProfile.displayName}</strong><span>{trustProfile.upiId}</span></div>
            </div>
            <div className="trust-signals">
              <span>✓ Identity verified — DEMO</span>
              <span>{trustProfile.phoneVerified ? '✓ Phone verified' : '• Phone unavailable'}</span>
              <span>{trustProfile.addressVerified ? '✓ Address verified' : '• Address unavailable'}</span>
              <span>✓ {trustProfile.connectedBankName} — Demo</span>
              <span>✓ Account {trustProfile.demoAccountNumber}</span>
              <span>• {trustProfile.kycDocumentType} — DEMO</span>
            </div>
            <label className="consent-row trust-consent">
              <input type="checkbox" checked={trustChecked} onChange={(event) => setTrustChecked(event.target.checked)} />
              <span>I reviewed this recipient profile and want to continue to payment.</span>
            </label>
          </div>
        )}
        
        <div className="form-group">
          <label htmlFor="amount">Amount (₹)</label>
          <input
            type="number"
            id="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="2000"
            min="0.01"
            step="0.01"
            disabled={loading}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="description">Description (optional)</label>
          <input
            type="text"
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Payment for..."
            disabled={loading}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="paymentMode">Payment type</label>
          <select id="paymentMode" value={mode} onChange={(event) => setMode(event.target.value as 'NORMAL' | 'PROTECTED')} disabled={loading}>
            <option value="PROTECTED">Protected - visible now, spendable after settlement</option>
            <option value="NORMAL">Normal - immediate simulated settlement</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="protectionSeconds">Protection Period</label>
          <select
            id="protectionSeconds"
            value={protectionSeconds}
            onChange={(e) => setProtectionSeconds(e.target.value)}
            disabled={loading || mode === 'NORMAL'}
          >
            <option value="300">5 minutes</option>
            <option value="600">10 minutes</option>
            <option value="900">15 minutes</option>
            <option value="1800">30 minutes</option>
            <option value="3600">1 hour</option>
          </select>
          <small>During this period, you can recover the payment or confirm settlement.</small>
        </div>
        
        <button 
          onClick={handleInitiatePayment} 
          className="btn-primary"
          disabled={!recipient || loading}
        >
          {loading ? 'Processing...' : mode === 'PROTECTED' ? 'Protect Payment' : 'Send Payment'}
        </button>
        
        <div className="info-box">
          <h4>How Protected Payments Work</h4>
          <ol>
            <li>Your balance is reduced by the payment amount</li>
            <li>Recipient sees the payment but CANNOT spend it</li>
            <li>You can RECOVER the money before expiry</li>
            <li>You can CONFIRM settlement to release funds to recipient</li>
            <li>If you do nothing, auto-settlement occurs at expiry</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default SendPaymentPage;
