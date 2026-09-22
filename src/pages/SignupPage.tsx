import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SignupPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!displayName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const upiPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
    if (!upiPattern.test(upiId.trim())) {
      setError('Enter a valid UPI ID. Example: alice@pactpay');
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password, displayName, upiId.trim());
      navigate('/connect-account');
    } catch (err: any) {
      setError(err?.message || 'Account could not be created. Please try again.');
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

        <form onSubmit={handleSubmit} className="auth-form">
          <h2>Create account</h2>

          {error && <div className="error-message">{error}</div>}

          <div className="field-group">
            <label htmlFor="displayName">Full name</label>
            <input type="text" id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required placeholder="Alice Kumar" />
          </div>

          <div className="field-group">
            <label htmlFor="email">Email</label>
            <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="alice@example.com" />
          </div>

          <div className="field-group">
            <label htmlFor="upiId">UPI ID</label>
            <input type="text" id="upiId" value={upiId} onChange={(e) => setUpiId(e.target.value.toLowerCase())} required placeholder="alice@pactpay" />
          </div>

          <div className="field-group">
            <label htmlFor="password">Password</label>
            <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
          </div>

          <div className="field-group">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input type="password" id="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="••••••••" />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <div className="auth-meta-row">
            <span>Already have an account?</span>
            <Link to="/login">Sign In</Link>
          </div>
        </form>

        <div className="demo-info compact-demo">
          <h3>Demo environment</h3>
          <p>New users begin at ₹0 DEMO and connect a demo bank before receiving the initial ₹12,000,000 balance.</p>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
