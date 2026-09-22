import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithPhoneNumber, RecaptchaVerifier, ConfirmationResult } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

const mapAuthError = (error: any) => {
  const code = error?.code || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Google sign-in was cancelled.';
  if (code === 'auth/popup-blocked') return 'Google sign-in was blocked by the browser. Please allow popups and try again.';
  if (code === 'auth/unauthorized-domain') return 'This app is not authorized for Google sign-in on this domain. Please contact setup support.';
  if (code === 'auth/provider-disabled') return 'Google sign-in is not enabled in Firebase Authentication.';
  if (code === 'auth/account-exists-with-different-credential') return 'This account already exists with a different sign-in method. Please use the original account.';
  if (code === 'auth/network-request-failed') return 'Connection problem. Please try again.';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Those sign-in details could not be verified.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait a moment and try again.';
  if (code === 'auth/phone-number-format') return 'Please enter a valid phone number.';
  return error?.message || 'Something went wrong. Please try again.';
};

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const canUsePhone = useMemo(() => typeof window !== 'undefined', []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/connect-account');
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      await signInWithGoogle();
      navigate('/connect-account');
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setError('');
    if (!phoneNumber.trim()) {
      setError('Enter a phone number to receive the one-time code.');
      return;
    }

    try {
      setOtpLoading(true);
      if (!(window as any).recaptchaVerifier) {
        (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: () => undefined,
        });
      }

      const confirm = await signInWithPhoneNumber(auth, phoneNumber, (window as any).recaptchaVerifier);
      setConfirmation(confirm);
      setOtpStep(true);
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmation || !otpCode.trim()) {
      setError('Enter the 6-digit code from your SMS.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await confirmation.confirm(otpCode);
      navigate('/connect-account');
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="brand-header">
          <div className="brand-mark">PACTPAY</div>
          <p className="subtitle">Protected payment infrastructure</p>
        </div>

        <button type="button" className="google-btn" onClick={handleGoogleSignIn} disabled={loading}>
          <span>G</span> Continue with Google
        </button>

        <div className="divider"><span>or</span></div>

        <form onSubmit={handleEmailSubmit} className="auth-form">
          <div className="field-label">Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />

          <div className="field-label">Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
          />

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="auth-meta-row">
            <Link to="/signup">Create account</Link>
            <button type="button" className="text-button">Forgot password</button>
          </div>
        </form>

        <div className="divider"><span>or</span></div>

        <div className="phone-panel">
          <div className="field-label">Phone number</div>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+91 98765 43210"
            disabled={otpLoading || loading}
          />
          {!otpStep ? (
            <button type="button" className="btn-secondary" onClick={handleSendOtp} disabled={otpLoading || !canUsePhone}>
              {otpLoading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          ) : (
            <>
              <div className="field-label">OTP code</div>
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
              />
              <button type="button" className="btn-primary" onClick={handleVerifyOtp} disabled={loading}>
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </>
          )}
          <div id="recaptcha-container" />
        </div>

        {error && <div className="error-message">{error}</div>}
      </div>
    </div>
  );
};

export default LoginPage;
