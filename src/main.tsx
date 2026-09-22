import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import SendPaymentPage from './pages/SendPaymentPage';
import PaymentDetailPage from './pages/PaymentDetailPage';
import HistoryPage from './pages/HistoryPage';
import ConnectAccountPage from './pages/ConnectAccountPage';
import KycPage from './pages/KycPage';
import './styles.css';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('PactPay startup error:', error, errorInfo);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-container">
          <div className="error-card">
            <p className="eyebrow">PACTPAY</p>
            <h1>PactPay couldn't load this page</h1>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const LoadingScreen = () => (
  <div className="page-container auth-shell">
    <div className="loading-card">
      <div className="brand-mark">PACTPAY</div>
      <div className="loading-text">Loading secure session...</div>
    </div>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, userProfile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (userProfile && userProfile.kycStatus !== 'VERIFIED') {
    return <Navigate to="/onboarding/kyc" replace />;
  }
  if (userProfile && userProfile.accountConnectionState !== 'CONNECTED') {
    return <Navigate to="/connect-account" replace />;
  }

  return <>{children}</>;
};

const KycRoute = () => {
  const { user, userProfile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (userProfile?.kycStatus === 'VERIFIED') return <Navigate to="/connect-account" replace />;
  return <KycPage />;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, userProfile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (user) {
    const destination = userProfile?.kycStatus !== 'VERIFIED'
      ? '/onboarding/kyc'
      : userProfile.accountConnectionState === 'CONNECTED' ? '/dashboard' : '/connect-account';
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
};

const RootRoute = () => {
  const { user, userProfile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (userProfile?.kycStatus !== 'VERIFIED') return <Navigate to="/onboarding/kyc" replace />;
  if (userProfile.accountConnectionState === 'CONNECTED') return <Navigate to="/dashboard" replace />;
  return <Navigate to="/connect-account" replace />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
      <Route path="/onboarding/kyc" element={<KycRoute />} />
      <Route path="/connect-account" element={<ProtectedRoute><ConnectAccountPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/send" element={<ProtectedRoute><SendPaymentPage /></ProtectedRoute>} />
      <Route path="/payment/:paymentId" element={<ProtectedRoute><PaymentDetailPage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL || '/vast_upi/'}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);
