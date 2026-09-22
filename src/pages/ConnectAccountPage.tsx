import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { connectDemoAccount } from '../lib/firestore';
import { formatAmount, INITIAL_DEMO_BALANCE_PAISE, DEMO_BANKS } from '../types';

const ConnectAccountPage = () => {
  const navigate = useNavigate();
  const { user, userProfile, refreshUserData } = useAuth();
  
  const [selectedBankId, setSelectedBankId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleConnectAccount = async () => {
    if (!selectedBankId) {
      setError('Please select a bank');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await connectDemoAccount(user!.uid, selectedBankId);
      await refreshUserData();
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to connect account');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (!selectedBankId) {
      setError('Please select a bank');
      return;
    }
    setShowConfirm(true);
  };

  if (userProfile?.accountConnectionState === 'CONNECTED') {
    return (
      <div className="page-container">
        <div className="form-page">
          <h2>Account Already Connected</h2>
          
          <div className="account-connected-card">
            <div className="success-icon">✓</div>
            <h3>{userProfile.connectedBankName}</h3>
            <p className="account-number">{userProfile.demoAccountNumber}</p>
            <p className="ifsc">IFSC: {userProfile.demoIfsc}</p>
            <p className="upi-id">{userProfile.upiId}</p>
            
            <div className="balance-info">
              <div className="balance-amount">
                {formatAmount(INITIAL_DEMO_BALANCE_PAISE)}
              </div>
              <p>Demo Balance Available</p>
            </div>
          </div>

          <button 
            onClick={() => navigate('/dashboard')} 
            className="btn-primary"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="form-page">
        <h2>Connect Your Demo Account</h2>
        
        <div className="info-box">
          <h4>🏦 Demo Banking Environment</h4>
          <p>
            Select a demo bank to create your synthetic account. You'll receive 
            {formatAmount(INITIAL_DEMO_BALANCE_PAISE)} to start using PactPay.
          </p>
          <p>
            <strong>Note:</strong> This is a simulated environment. No real money or bank accounts are involved.
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}

        {!showConfirm ? (
          <>
            <div className="form-group">
              <label htmlFor="bankSelect">Choose Your Bank</label>
              <select
                id="bankSelect"
                value={selectedBankId}
                onChange={(e) => {
                  setSelectedBankId(e.target.value);
                  setError('');
                }}
              >
                <option value="">-- Select a Bank --</option>
                {DEMO_BANKS.filter(b => b.active).map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name} ({bank.shortName})
                  </option>
                ))}
              </select>
            </div>

            {selectedBankId && (
              <div className="bank-preview">
                <h4>Account Preview</h4>
                <div className="preview-details">
                  <p><strong>Bank:</strong> {DEMO_BANKS.find(b => b.id === selectedBankId)?.name}</p>
                  <p><strong>Account Holder:</strong> {userProfile?.displayName}</p>
                  <p><strong>UPI ID:</strong> {userProfile?.upiId}</p>
                  <p><strong>Initial Balance:</strong> {formatAmount(INITIAL_DEMO_BALANCE_PAISE)}</p>
                </div>
              </div>
            )}

            <button 
              onClick={handleContinue} 
              className="btn-primary"
              disabled={!selectedBankId || loading}
            >
              Continue
            </button>
          </>
        ) : (
          <div className="confirmation-screen">
            <h3>Confirm Account Connection</h3>
            
            <div className="confirmation-details">
              <div className="detail-row">
                <span className="label">Bank:</span>
                <span className="value">{DEMO_BANKS.find(b => b.id === selectedBankId)?.name}</span>
              </div>
              
              <div className="detail-row">
                <span className="label">Account Holder:</span>
                <span className="value">{userProfile?.displayName}</span>
              </div>
              
              <div className="detail-row">
                <span className="label">UPI ID:</span>
                <span className="value">{userProfile?.upiId}</span>
              </div>
              
              <div className="detail-row">
                <span className="label">Initial Demo Balance:</span>
                <span className="value highlight">{formatAmount(INITIAL_DEMO_BALANCE_PAISE)}</span>
              </div>
              
              <div className="warning-box">
                <strong>⚠️ Important:</strong>
                <ul>
                  <li>This creates a DEMO account with synthetic funds</li>
                  <li>No real bank connection is established</li>
                  <li>You cannot withdraw or transfer funds outside PactPay</li>
                  <li>All transactions are simulated for demonstration</li>
                </ul>
              </div>
            </div>

            <div className="modal-actions">
              <button 
                onClick={() => setShowConfirm(false)} 
                className="btn-secondary"
                disabled={loading}
              >
                Back
              </button>
              <button 
                onClick={handleConnectAccount} 
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Connecting...' : 'Connect & Receive Demo Funds'}
              </button>
            </div>
          </div>
        )}

        <div className="demo-banks-list">
          <h4>Available Demo Banks</h4>
          <div className="banks-grid">
            {DEMO_BANKS.filter(b => b.active).map((bank) => (
              <div 
                key={bank.id}
                className={`bank-card ${selectedBankId === bank.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedBankId(bank.id);
                  setError('');
                }}
              >
                <div className="bank-name">{bank.name}</div>
                <div className="bank-short">{bank.shortName}</div>
                {bank.demoOnly && <span className="demo-badge">Demo Only</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectAccountPage;
