import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { connectDemoAccount } from '../lib/firestore';
import { formatAmount, INITIAL_DEMO_BALANCE_PAISE, DEMO_BANKS, DemoBank } from '../types';

const DEFAULT_BANKS = DEMO_BANKS;

const ConnectAccountPage = () => {
  const navigate = useNavigate();
  const { user, userProfile, refreshUserData } = useAuth();

  const [bankList, setBankList] = useState<DemoBank[]>(DEFAULT_BANKS);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accountType, setAccountType] = useState<'SAVINGS_DEMO' | 'CURRENT_DEMO'>('SAVINGS_DEMO');

  useEffect(() => {
    const loadRemoteBanks = async () => {
      try {
        setRemoteLoading(true);
        const snapshot = await getDocs(collection(db, 'banks'));
        const remoteBanks = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: String(data.id || doc.id),
            name: String(data.name || 'Bank'),
            shortName: String(data.shortName || data.name || 'BANK'),
            active: data.active !== false,
            demoOnly: data.demoOnly !== false,
          } as DemoBank;
        });

        if (remoteBanks.length > 0) {
          setBankList(remoteBanks);
        }
      } catch {
        setBankList(DEFAULT_BANKS);
      } finally {
        setRemoteLoading(false);
      }
    };

    loadRemoteBanks();
  }, []);

  const filteredBanks = useMemo(() => {
    const list = bankList.length ? bankList : DEFAULT_BANKS;
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((bank) => {
      const text = `${bank.name} ${bank.shortName}`.toLowerCase();
      return text.includes(term);
    });
  }, [bankList, search]);

  const selectedBank = bankList.find((bank) => bank.id === selectedBankId) || DEFAULT_BANKS.find((bank) => bank.id === selectedBankId) || null;

  const handleConnectAccount = async () => {
    if (!selectedBankId || !user) {
      setError('Please choose a bank to continue.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await connectDemoAccount(user.uid, selectedBankId, userProfile?.upiId, accountType);
      await refreshUserData();
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Account setup could not be completed. Please try again.');
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
        <div className="form-page account-setup-card">
          <p className="eyebrow">PACTPAY</p>
          <h2>Account connected ✓</h2>
          <div className="info-box success-box">
            <div className="detail-row">
              <span className="label">Bank:</span>
              <span className="value">{userProfile.connectedBankName}</span>
            </div>
            <div className="detail-row">
              <span className="label">Account:</span>
              <span className="value">•••• {String(userProfile.demoAccountNumber || '').slice(-4)}</span>
            </div>
            <div className="detail-row">
              <span className="label">UPI:</span>
              <span className="value">{userProfile.upiId}</span>
            </div>
            <div className="detail-row">
              <span className="label">Status:</span>
              <span className="value status-live">CONNECTED</span>
            </div>
          </div>
          <div className="balance-card primary compact">
            <h3>Available</h3>
            <div className="balance-amount">{formatAmount(INITIAL_DEMO_BALANCE_PAISE)}</div>
          </div>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">Go to dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="form-page account-setup-card">
        <p className="eyebrow">DEMO ENVIRONMENT</p>
        <h2>Connect your demo account</h2>
        <p className="muted-text">Choose a bank to create your simulated PactPay account.</p>

        {error && <div className="error-message">{error}</div>}

        {!showConfirm ? (
          <>
            <div className="search-box">
              <span className="search-icon">🔎</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your bank"
                aria-label="Search bank"
              />
            </div>

            {remoteLoading && <div className="info-banner">Loading available demo banks…</div>}

            <div className="form-group">
              <label htmlFor="accountType">Account type</label>
              <select id="accountType" value={accountType} onChange={(event) => setAccountType(event.target.value as 'SAVINGS_DEMO' | 'CURRENT_DEMO')}>
                <option value="SAVINGS_DEMO">Savings Account - Demo</option>
                <option value="CURRENT_DEMO">Current Account - Demo</option>
              </select>
              <small>Demo onboarding requirements are configurable and are not bank-specific legal advice.</small>
            </div>

            <div className="bank-list" role="listbox" aria-label="Bank list">
              {filteredBanks.length === 0 ? (
                <div className="empty-state-box">No banks match your search.</div>
              ) : (
                filteredBanks.map((bank) => (
                  <button
                    type="button"
                    key={bank.id}
                    className={`bank-row ${selectedBankId === bank.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedBankId(bank.id);
                      setError('');
                    }}
                  >
                    <div>
                      <div className="bank-name">{bank.name}</div>
                      <div className="bank-meta">{bank.shortName}</div>
                    </div>
                    <span className="bank-tag">DEMO</span>
                  </button>
                ))
              )}
            </div>

            {selectedBank && (
              <div className="preview-card">
                <div className="preview-header">Selected bank</div>
                <div className="bank-name strong">{selectedBank.name}</div>
                <div className="detail-row">
                  <span className="label">Account type:</span>
                  <span className="value">{accountType === 'SAVINGS_DEMO' ? 'Savings Account - Demo' : 'Current Account - Demo'}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Account holder:</span>
                  <span className="value">{userProfile?.displayName || 'PactPay User'}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Phone:</span>
                  <span className="value">{user?.phoneNumber || 'Demo number'}</span>
                </div>
                <div className="detail-row">
                  <span className="label">UPI:</span>
                  <span className="value">{userProfile?.upiId || 'user@pactpay'}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Initial balance:</span>
                  <span className="value highlight">{formatAmount(INITIAL_DEMO_BALANCE_PAISE)}</span>
                </div>
              </div>
            )}

            <button onClick={handleContinue} className="btn-primary" disabled={!selectedBankId || loading}>
              Continue
            </button>
          </>
        ) : (
          <div className="confirmation-screen">
            <h3>Confirm account connection</h3>
            <div className="detail-row"><span className="label">Bank:</span><span className="value">{selectedBank?.name}</span></div>
            <div className="detail-row"><span className="label">Account holder:</span><span className="value">{userProfile?.displayName}</span></div>
            <div className="detail-row"><span className="label">Phone:</span><span className="value">{user?.phoneNumber || 'Demo number'}</span></div>
            <div className="detail-row"><span className="label">UPI:</span><span className="value">{userProfile?.upiId}</span></div>
            <div className="detail-row"><span className="label">Demo account number:</span><span className="value">••••••••••••</span></div>
            <div className="detail-row"><span className="label">Synthetic IFSC:</span><span className="value">{selectedBank?.id.toUpperCase().slice(0, 4) || 'PCTP'}0001</span></div>
            <div className="detail-row"><span className="label">Initial balance:</span><span className="value highlight">{formatAmount(INITIAL_DEMO_BALANCE_PAISE)}</span></div>

            <div className="warning-box">
              <strong>Demo environment</strong>
              <p>This creates a simulated bank account and grants the first 12,000,000 DEMO balance only after a successful backend connection.</p>
            </div>

            <div className="modal-actions split-actions">
              <button onClick={() => setShowConfirm(false)} className="btn-secondary" disabled={loading}>Back</button>
              <button onClick={handleConnectAccount} className="btn-primary" disabled={loading}>
                {loading ? 'Connecting…' : 'Connect & Activate Account'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectAccountPage;
