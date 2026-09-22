import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

type DocumentType = 'PAN' | 'AADHAAR' | 'DRIVING_LICENCE' | 'PASSPORT' | 'VOTER_ID';
type KycStep = 'PERSONAL' | 'DOCUMENT' | 'REVIEW' | 'SUBMIT' | 'RESULT';

const documents: Array<{ type: DocumentType; label: string; preview: string }> = [
  { type: 'PAN', label: 'PAN', preview: 'DEMO-PAN-XXXX' },
  { type: 'AADHAAR', label: 'Aadhaar', preview: 'DEMO-AADHAAR-XXXX' },
  { type: 'DRIVING_LICENCE', label: 'Driving Licence', preview: 'DEMO-DL-XXXX' },
  { type: 'PASSPORT', label: 'Passport', preview: 'DEMO-PASSPORT-XXXX' },
  { type: 'VOTER_ID', label: 'Voter ID', preview: 'DEMO-VOTER-XXXX' },
];

const steps: Array<{ key: KycStep; label: string }> = [
  { key: 'PERSONAL', label: 'Personal information' },
  { key: 'DOCUMENT', label: 'Identity document' },
  { key: 'REVIEW', label: 'Review' },
  { key: 'SUBMIT', label: 'Submit' },
  { key: 'RESULT', label: 'Verification result' },
];

const KycPage = () => {
  const navigate = useNavigate();
  const { user, userProfile, refreshUserData } = useAuth();
  const [step, setStep] = useState<KycStep>('PERSONAL');
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [fullName, setFullName] = useState(userProfile?.displayName || user?.displayName || '');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedDocument = useMemo(
    () => documents.find((document) => document.type === documentType) || null,
    [documentType],
  );
  const currentStepIndex = steps.findIndex((item) => item.key === step);
  const verified = userProfile?.kycStatus === 'VERIFIED';
  const pending = userProfile?.kycStatus === 'VERIFICATION_PENDING';

  useEffect(() => {
    if (pending || verified) setStep('RESULT');
  }, [pending, verified]);

  const continueFromPersonal = () => {
    if (!fullName.trim() || !dateOfBirth || !address.trim() || !city.trim() || !state.trim() || !/^\d{6}$/.test(pinCode)) {
      setError('Complete every personal information field. PIN code must contain 6 digits.');
      return;
    }
    setError('');
    setStep('DOCUMENT');
  };

  const submitKyc = async () => {
    if (!selectedDocument || !consent) {
      setError('Select a document and accept the synthetic demo consent.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const submitDemoKyc = httpsCallable(functions, 'submitDemoKyc');
      await submitDemoKyc({ displayName: fullName.trim(), dateOfBirth, address: address.trim(), city: city.trim(), state: state.trim(), pinCode, documentType: selectedDocument.type, consent: true });
      await refreshUserData();
      setStep('RESULT');
    } catch (err: any) {
      setError(err?.message || 'Demo KYC could not be submitted. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyKyc = async () => {
    setLoading(true);
    setError('');
    try {
      const verifyDemoKyc = httpsCallable(functions, 'verifyDemoKyc');
      await verifyDemoKyc({});
      await refreshUserData();
    } catch (err: any) {
      setError(err?.message || 'Demo verification is unavailable. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const back = () => {
    setError('');
    if (step === 'DOCUMENT') setStep('PERSONAL');
    if (step === 'REVIEW') setStep('DOCUMENT');
    if (step === 'SUBMIT') setStep('REVIEW');
  };

  const personal = (
    <>
      <div className="section-heading"><div><p className="eyebrow">KYC · PERSONAL INFORMATION</p><h2>Tell us about yourself</h2></div><span className="status-badge info">1 / 5</span></div>
      <div className="form-grid">
        <div className="field-group wide"><label htmlFor="fullName">Full name</label><input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} /></div>
        <div className="field-group"><label htmlFor="dateOfBirth">Date of birth</label><input id="dateOfBirth" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} /></div>
        <div className="field-group"><label htmlFor="mobile">Mobile</label><input id="mobile" value={user?.phoneNumber || 'Provided by authentication'} readOnly /></div>
        <div className="field-group wide"><label htmlFor="address">Address</label><input id="address" value={address} onChange={(event) => setAddress(event.target.value)} /></div>
        <div className="field-group"><label htmlFor="city">City</label><input id="city" value={city} onChange={(event) => setCity(event.target.value)} /></div>
        <div className="field-group"><label htmlFor="state">State</label><input id="state" value={state} onChange={(event) => setState(event.target.value)} /></div>
        <div className="field-group"><label htmlFor="pinCode">PIN code</label><input id="pinCode" inputMode="numeric" value={pinCode} onChange={(event) => setPinCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
      </div>
      <div className="onboarding-actions"><span className="muted-text">Synthetic demo information only.</span><button className="btn-primary onboarding-submit" type="button" onClick={continueFromPersonal}>Continue</button></div>
    </>
  );

  const documentStep = (
    <>
      <div className="section-heading"><div><p className="eyebrow">KYC · IDENTITY DOCUMENT</p><h2>Choose a demo identity document</h2></div><span className="status-badge info">2 / 5</span></div>
      <p className="muted-text">No real ID number is requested.</p>
      <div className="document-options">{documents.map((document) => <button type="button" key={document.type} className={`document-option ${documentType === document.type ? 'selected' : ''}`} onClick={() => setDocumentType(document.type)}><strong>{document.label}</strong><span>DEMO</span><small>NO REAL ID REQUIRED</small></button>)}</div>
      {selectedDocument && <div className="document-preview"><div className="document-preview-top"><span>SELECTED DOCUMENT</span><span>DEMO</span></div><h3>{selectedDocument.label}</h3><p>{selectedDocument.preview}</p><p>Status: <strong>READY TO SUBMIT · NOT VERIFIED YET</strong></p></div>}
      <div className="onboarding-actions"><button className="btn-secondary" type="button" onClick={back}>Back</button><button className="btn-primary onboarding-submit" type="button" disabled={!selectedDocument} onClick={() => setStep('REVIEW')}>Continue</button></div>
    </>
  );

  const review = (
    <>
      <div className="section-heading"><div><p className="eyebrow">KYC · REVIEW</p><h2>Review your information</h2></div><span className="status-badge info">3 / 5</span></div>
      <div className="review-card"><h3>Personal information</h3><div className="detail-row"><span className="label">Name</span><span className="value">{fullName}</span></div><div className="detail-row"><span className="label">DOB</span><span className="value">{dateOfBirth}</span></div><div className="detail-row"><span className="label">Mobile</span><span className="value">{user?.phoneNumber || 'Authentication verified'}</span></div><div className="detail-row"><span className="label">Address</span><span className="value">{address}, {city}, {state} - {pinCode}</span></div><h3>Identity document</h3><div className="detail-row"><span className="label">Document</span><span className="value">{selectedDocument?.label} - DEMO</span></div><div className="detail-row"><span className="label">Synthetic ID</span><span className="value">{selectedDocument?.preview}</span></div><div className="detail-row"><span className="label">Status</span><span className="value">READY FOR DEMO VERIFICATION</span></div></div>
      <div className="onboarding-actions"><button className="btn-secondary" type="button" onClick={back}>Back</button><button className="btn-primary onboarding-submit" type="button" onClick={() => setStep('SUBMIT')}>Continue</button></div>
    </>
  );

  const submit = (
    <>
      <div className="section-heading"><div><p className="eyebrow">KYC · SUBMIT</p><h2>Submit Demo KYC</h2></div><span className="status-badge info">4 / 5</span></div>
      <div className="info-box"><h4>Simulated verification process</h4><p>This is synthetic demo data for the PactPay demonstration network. Real identity documents are never requested.</p></div>
      <label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I understand this is synthetic demo data and consent to submitting this demo KYC profile.</span></label>
      <div className="onboarding-actions"><button className="btn-secondary" type="button" onClick={back}>Back</button><button className="btn-primary onboarding-submit" type="button" disabled={!consent || loading} onClick={submitKyc}>{loading ? 'Submitting...' : 'Submit Demo KYC'}</button></div>
    </>
  );

  const result = verified ? (
    <>
      <div className="section-heading"><div><p className="eyebrow">KYC · VERIFICATION RESULT</p><h2>KYC Verified — DEMO</h2></div><span className="status-badge success">VERIFIED — DEMO</span></div>
      <div className="result-grid"><div>✓ <strong>Identity</strong><span>Verified — Demo</span></div><div>✓ <strong>Address</strong><span>Verified — Demo</span></div><div>✓ <strong>Profile</strong><span>Complete</span></div><div>✓ <strong>Demo document</strong><span>{userProfile?.kycDocumentType || selectedDocument?.label || 'Verified'}</span></div></div>
      <button className="btn-primary" type="button" onClick={() => navigate('/connect-account')}>Continue to Bank Account</button>
    </>
  ) : (
    <>
      <div className="section-heading"><div><p className="eyebrow">KYC · VERIFICATION RESULT</p><h2>Verification pending</h2></div><span className="status-badge warning">5 / 5 · PENDING</span></div>
      <div className="pending-state"><div className="pending-spinner" /><h3>Verification pending</h3><p>The trusted backend has received the synthetic profile. The browser cannot mark it verified.</p></div>
      <button className="btn-primary" type="button" onClick={verifyKyc} disabled={loading}>{loading ? 'Checking...' : 'Check Demo Verification'}</button>
    </>
  );

  const content = step === 'PERSONAL' ? personal : step === 'DOCUMENT' ? documentStep : step === 'REVIEW' ? review : step === 'SUBMIT' ? submit : result;

  return <div className="page-container onboarding-page"><div className="onboarding-header"><div><p className="eyebrow">PACTPAY ONBOARDING · DEMO KYC</p><h1>Complete your demo KYC</h1><p className="muted-text">A simulated identity check for the closed PactPay demonstration network.</p></div><span className="demo-pill">DEMO KYC</span></div><div className="stepper" aria-label="KYC progress">{steps.map((item, index) => <div className={`step ${index <= currentStepIndex ? 'active' : ''}`} key={item.key}><span>{index + 1}</span><strong>{item.label}</strong></div>)}</div><div className="onboarding-card">{error && <div className="error-message" role="alert">{error}</div>}{content}</div></div>;
};

export default KycPage;
