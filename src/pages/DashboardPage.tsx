import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  getWallet, 
  updateSecurityPolicy,
} from '../lib/firestore';
import { Wallet, SecurityPolicy, DEFAULT_SECURITY_POLICY, formatAmount, toPaise, toRupees, AccountConnectionState } from '../types';

const DashboardPage = () => {
  const navigate = useNavigate();
  const { user, userProfile, wallet, securityPolicy, refreshUserData, logout } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [showPolicyEditor, setShowPolicyEditor] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    verificationEnabled: true,
    verificationThreshold: 1000,
    verifyNewRecipient: true,
    verifyRecovery: true,
    verifySettlement: true,
    protectionPeriodSeconds: 600,
  });

  // Redirect to connect account page if not connected
  useEffect(() => {
    if (userProfile && userProfile.accountConnectionState !== 'CONNECTED') {
      navigate('/connect-account');
    }
  }, [userProfile, navigate]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleOpenPolicyEditor = () => {
    if (securityPolicy) {
      setPolicyForm({
        verificationEnabled: securityPolicy.verificationEnabled,
        verificationThreshold: toRupees(securityPolicy.verificationThreshold),
        verifyNewRecipient: securityPolicy.verifyNewRecipient,
        verifyRecovery: securityPolicy.verifyRecovery,
        verifySettlement: securityPolicy.verifySettlement,
        protectionPeriodSeconds: securityPolicy.protectionPeriodSeconds,
      });
    } else {
      setPolicyForm({
        verificationEnabled: DEFAULT_SECURITY_POLICY.verificationEnabled,
        verificationThreshold: toRupees(DEFAULT_SECURITY_POLICY.verificationThreshold),
        verifyNewRecipient: DEFAULT_SECURITY_POLICY.verifyNewRecipient,
        verifyRecovery: DEFAULT_SECURITY_POLICY.verifyRecovery,
        verifySettlement: DEFAULT_SECURITY_POLICY.verifySettlement,
        protectionPeriodSeconds: DEFAULT_SECURITY_POLICY.protectionPeriodSeconds,
      });
    }
    setShowPolicyEditor(true);
  };

  const handleSavePolicy = async () => {
    setLoading(true);
    try {
      await updateSecurityPolicy(user!.uid, {
        verificationEnabled: policyForm.verificationEnabled,
        verificationThreshold: toPaise(policyForm.verificationThreshold),
        verifyNewRecipient: policyForm.verifyNewRecipient,
        verifyRecovery: policyForm.verifyRecovery,
        verifySettlement: policyForm.verifySettlement,
        protectionPeriodSeconds: policyForm.protectionPeriodSeconds,
      });
      await refreshUserData();
      setShowPolicyEditor(false);
    } catch (err: any) {
      console.error('Error saving policy:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <header className="dashboard-header">
        <div className="dashboard-brand-row">
          <div className="brand-mark">PACTPAY</div>
          <span className="demo-pill">DEMO NETWORK</span>
        </div>
        <div className="user-info">
          <h1>Welcome, {userProfile?.displayName || 'User'}</h1>
          <p className="upi-id">{userProfile?.upiId} · Synthetic PactPay identity</p>
        </div>
        <button onClick={handleLogout} className="btn-secondary">Logout</button>
      </header>

      <div className="demo-banner">
        <div>
          <strong>DEMO ENVIRONMENT</strong>
          <p>All balances, accounts and transfers here are simulated. No real bank or UPI rail is connected.</p>
        </div>
        <span className="status-live">LIVE DEMO</span>
      </div>
      
      {/* Account Connection Status */}
      {userProfile?.accountConnectionState === 'CONNECTED' && (
        <div className="account-status-card">
          <h3>Connected Account</h3>
          <div className="account-details">
            <p><strong>Bank:</strong> {userProfile.connectedBankName}</p>
            <p><strong>Account:</strong> {userProfile.demoAccountNumber}</p>
            <p><strong>IFSC:</strong> {userProfile.demoIfsc}</p>
            <p><strong>UPI ID:</strong> {userProfile.upiId}</p>
            <span className="status-badge status-connected">✓ CONNECTED</span>
          </div>
        </div>
      )}

      {/* Balance Cards */}
      <div className="balance-cards">
        <div className="balance-card primary">
          <h3>Available Balance</h3>
          <div className="balance-amount">
            {wallet ? formatAmount(wallet.availableBalance) : 'Loading...'}
          </div>
          <p className="balance-note">Spendable funds</p>
        </div>
        
        <div className="balance-card">
          <h3>Protected Outgoing</h3>
          <div className="balance-amount">
            {wallet ? formatAmount(wallet.protectedOutgoing) : '₹0.00'}
          </div>
          <p className="balance-note">Pending your confirmation/recovery</p>
        </div>
        
        <div className="balance-card">
          <h3>Protected Incoming</h3>
          <div className="balance-amount">
            {wallet ? formatAmount(wallet.protectedIncoming) : '₹0.00'}
          </div>
          <p className="balance-note warning">NOT SPENDABLE</p>
        </div>
      </div>

      {wallet && (
        <div className="balance-summary">
          <div><span>Displayed total</span><strong>{formatAmount(wallet.availableBalance + wallet.protectedIncoming)}</strong></div>
          <div><span>Spendable now</span><strong>{formatAmount(wallet.availableBalance)}</strong></div>
          <div><span>Protected funds</span><strong>{formatAmount(wallet.protectedIncoming + wallet.protectedOutgoing)}</strong></div>
        </div>
      )}

      <div className="readiness-grid">
        <div className="readiness-card">
          <div className="readiness-icon">✓</div>
          <div>
            <p className="eyebrow">DEMO KYC</p>
            <h3>Verified — Demo</h3>
            <p>Identity and address checks are synthetic and private to your account.</p>
          </div>
        </div>
        <div className="readiness-card">
          <div className="readiness-icon">✓</div>
          <div>
            <p className="eyebrow">DEMO ACCOUNT</p>
            <h3>{userProfile?.connectedBankName} connected</h3>
            <p>{userProfile?.demoAccountNumber} · {userProfile?.demoIfsc}</p>
          </div>
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="quick-actions">
        <button 
          onClick={() => navigate('/send')} 
          className="action-btn primary"
        >
          Send Protected Payment
        </button>
        
        <button 
          onClick={() => navigate('/history')} 
          className="action-btn"
        >
          View History
        </button>
        
        <button 
          onClick={handleOpenPolicyEditor} 
          className="action-btn"
        >
          Security Settings
        </button>
      </div>
      
      {/* Security Policy Summary */}
      {securityPolicy && (
        <div className="policy-summary">
          <h3>Your Security Policy</h3>
          <div className="policy-grid">
            <div className="policy-item">
              <span className="label">Verification:</span>
              <span className={`value ${securityPolicy.verificationEnabled ? 'enabled' : 'disabled'}`}>
                {securityPolicy.verificationEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            
            <div className="policy-item">
              <span className="label">Threshold:</span>
              <span className="value">{formatAmount(securityPolicy.verificationThreshold)}</span>
            </div>
            
            <div className="policy-item">
              <span className="label">Verify New Recipients:</span>
              <span className={`value ${securityPolicy.verifyNewRecipient ? 'enabled' : 'disabled'}`}>
                {securityPolicy.verifyNewRecipient ? 'Yes' : 'No'}
              </span>
            </div>
            
            <div className="policy-item">
              <span className="label">Verify Recovery:</span>
              <span className={`value ${securityPolicy.verifyRecovery ? 'enabled' : 'disabled'}`}>
                {securityPolicy.verifyRecovery ? 'Yes' : 'No'}
              </span>
            </div>
            
            <div className="policy-item">
              <span className="label">Verify Settlement:</span>
              <span className={`value ${securityPolicy.verifySettlement ? 'enabled' : 'disabled'}`}>
                {securityPolicy.verifySettlement ? 'Yes' : 'No'}
              </span>
            </div>
            
            <div className="policy-item">
              <span className="label">Default Protection:</span>
              <span className="value">{securityPolicy.protectionPeriodSeconds / 60} minutes</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Important Notice */}
      <div className="info-box important">
        <h4>⚠️ Protected Money Cannot Be Spent</h4>
        <p>
          Funds in "Protected Incoming" are visible but NOT spendable. Only "Available Balance" 
          can be used for outgoing payments. This is a core security feature of PactPay.
        </p>
      </div>
      
      {/* Security Policy Editor Modal */}
      {showPolicyEditor && (
        <div className="modal-overlay">
          <div className="modal large">
            <h3>Security Policy Settings</h3>
            
            <div className="modal-body">
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={policyForm.verificationEnabled}
                    onChange={(e) => setPolicyForm({...policyForm, verificationEnabled: e.target.checked})}
                  />
                  Enable Two-Step Verification
                </label>
              </div>
              
              <div className="form-group">
                <label htmlFor="threshold">Verification Threshold (₹)</label>
                <input
                  type="number"
                  id="threshold"
                  value={policyForm.verificationThreshold}
                  onChange={(e) => setPolicyForm({...policyForm, verificationThreshold: parseFloat(e.target.value) || 0})}
                  disabled={!policyForm.verificationEnabled}
                  min="0"
                  step="100"
                />
                <small>Payments at or above this amount require additional verification</small>
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={policyForm.verifyNewRecipient}
                    onChange={(e) => setPolicyForm({...policyForm, verifyNewRecipient: e.target.checked})}
                    disabled={!policyForm.verificationEnabled}
                  />
                  Verify Payments to New Recipients
                </label>
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={policyForm.verifyRecovery}
                    onChange={(e) => setPolicyForm({...policyForm, verifyRecovery: e.target.checked})}
                    disabled={!policyForm.verificationEnabled}
                  />
                  Verify Recovery Actions
                </label>
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={policyForm.verifySettlement}
                    onChange={(e) => setPolicyForm({...policyForm, verifySettlement: e.target.checked})}
                    disabled={!policyForm.verificationEnabled}
                  />
                  Verify Settlement Actions
                </label>
              </div>
              
              <div className="form-group">
                <label htmlFor="protectionPeriod">Default Protection Period</label>
                <select
                  id="protectionPeriod"
                  value={policyForm.protectionPeriodSeconds}
                  onChange={(e) => setPolicyForm({...policyForm, protectionPeriodSeconds: parseInt(e.target.value)})}
                >
                  <option value="300">5 minutes</option>
                  <option value="600">10 minutes</option>
                  <option value="900">15 minutes</option>
                  <option value="1800">30 minutes</option>
                  <option value="3600">1 hour</option>
                </select>
              </div>
            </div>
            
            <div className="modal-actions">
              <button 
                onClick={() => setShowPolicyEditor(false)} 
                className="btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                onClick={handleSavePolicy} 
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
