import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  getPayment, 
  getPaymentEvents, 
  executeRecovery, 
  executeSettlement,
  getUser,
} from '../lib/firestore';
import { Payment, PaymentEvent, PaymentStatus, formatAmount, isTerminalState } from '../types';

const PaymentDetailPage = () => {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const { user, refreshUserData } = useAuth();
  
  const [payment, setPayment] = useState<Payment | null>(null);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [sender, setSender] = useState<{ displayName: string; upiId: string } | null>(null);
  const [recipient, setRecipient] = useState<{ displayName: string; upiId: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'recover' | 'settle' | null>(null);

  useEffect(() => {
    loadPaymentData();
  }, [paymentId]);

  const loadPaymentData = async () => {
    if (!paymentId) return;

    try {
      setLoading(true);
      const paymentData = await getPayment(paymentId);
      
      if (!paymentData) {
        setError('Payment not found');
        return;
      }

      // Check authorization (sender or recipient)
      if (paymentData.senderId !== user?.uid && paymentData.recipientId !== user?.uid) {
        setError('Unauthorized access to this payment');
        return;
      }

      setPayment(paymentData);

      // Load sender and recipient details
      const [senderData, recipientData] = await Promise.all([
        getUser(paymentData.senderId),
        getUser(paymentData.recipientId),
      ]);

      setSender(senderData);
      setRecipient(recipientData);

      // Load events
      const paymentEvents = await getPaymentEvents(paymentId);
      setEvents(paymentEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
    } catch (err: any) {
      setError(err.message || 'Error loading payment');
    } finally {
      setLoading(false);
    }
  };

  const canRecover = (): boolean => {
    if (!payment || !user) return false;
    
    // Only sender can recover
    if (payment.senderId !== user.uid) return false;
    
    // Cannot recover if already in terminal state
    if (isTerminalState(payment.status)) return false;
    
    // Can recover if PROTECTED or ACKNOWLEDGED
    return ['PROTECTED', 'ACKNOWLEDGED'].includes(payment.status);
  };

  const canSettle = (): boolean => {
    if (!payment || !user) return false;
    
    // Only sender can settle
    if (payment.senderId !== user.uid) return false;
    
    // Cannot settle if already in terminal state
    if (isTerminalState(payment.status)) return false;
    
    // Can settle if PROTECTED or ACKNOWLEDGED
    return ['PROTECTED', 'ACKNOWLEDGED'].includes(payment.status);
  };

  const handleRecover = () => {
    setPendingAction('recover');
    setShowConfirmModal(true);
  };

  const handleSettle = () => {
    setPendingAction('settle');
    setShowConfirmModal(true);
  };

  const confirmAction = async () => {
    if (!payment || !pendingAction) return;

    setActionLoading(true);
    setError('');

    try {
      if (pendingAction === 'recover') {
        // Execute recovery transaction
        await executeRecovery(
          payment.senderId,
          payment.recipientId,
          payment.amount,
          payment.id
        );

      } else if (pendingAction === 'settle') {
        // Execute settlement transaction
        await executeSettlement(
          payment.senderId,
          payment.recipientId,
          payment.amount,
          payment.id
        );

      }

      // Refresh data
      await refreshUserData();
      await loadPaymentData();
      setShowConfirmModal(false);
      setPendingAction(null);
    } catch (err: any) {
      setError(err.message || `Failed to ${pendingAction} payment`);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status: PaymentStatus): string => {
    switch (status) {
      case 'PROTECTED':
        return 'warning';
      case 'ACKNOWLEDGED':
        return 'info';
      case 'RECOVERED':
        return 'secondary';
      case 'SETTLED':
        return 'success';
      case 'EXPIRED':
        return 'danger';
      default:
        return '';
    }
  };

  if (loading) {
    return <div className="page-container"><div className="loading">Loading payment details...</div></div>;
  }

  if (!payment) {
    return <div className="page-container"><div className="error-message">{error || 'Payment not found'}</div></div>;
  }

  const isSender = user?.uid === payment.senderId;
  const isRecipient = user?.uid === payment.recipientId;

  return (
    <div className="page-container">
      <div className="payment-detail">
        <h2>Payment Details</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <div className={`status-badge ${getStatusColor(payment.status)}`}>
          {payment.status}
        </div>
        
        <div className="payment-amount">
          {formatAmount(payment.amount)}
        </div>
        
        <div className="payment-info-grid">
          <div className="info-row">
            <span className="label">From:</span>
            <span className="value">
              {sender?.displayName} ({sender?.upiId})
            </span>
          </div>
          
          <div className="info-row">
            <span className="label">To:</span>
            <span className="value">
              {recipient?.displayName} ({recipient?.upiId})
            </span>
          </div>
          
          <div className="info-row">
            <span className="label">Description:</span>
            <span className="value">{payment.description}</span>
          </div>
          
          <div className="info-row">
            <span className="label">Created:</span>
            <span className="value">{payment.createdAt.toLocaleString()}</span>
          </div>
          
          <div className="info-row">
            <span className="label">Expires:</span>
            <span className="value">{payment.expiresAt.toLocaleString()}</span>
          </div>
          
          <div className="info-row">
            <span className="label">Protection Period:</span>
            <span className="value">{payment.protectionSeconds / 60} minutes</span>
          </div>
        </div>
        
        {/* Action buttons for sender */}
        {isSender && !isTerminalState(payment.status) && (
          <div className="action-buttons">
            {canRecover() && (
              <button 
                onClick={handleRecover} 
                className="btn-secondary"
                disabled={actionLoading}
              >
                Recover {formatAmount(payment.amount)}
              </button>
            )}
            
            {canSettle() && (
              <button 
                onClick={handleSettle} 
                className="btn-primary"
                disabled={actionLoading}
              >
                Confirm Settlement
              </button>
            )}
          </div>
        )}
        
        {/* Recipient view */}
        {isRecipient && (
          <div className="recipient-notice">
            {payment.status === 'PROTECTED' || payment.status === 'ACKNOWLEDGED' ? (
              <>
                <h3>⚠️ Payment Received - NOT YET SPENDABLE</h3>
                <p>
                  This payment is in <strong>{payment.status}</strong> state.
                </p>
                <p>
                  The sender can recover this payment before expiry, or confirm settlement to release the funds.
                </p>
                <p>
                  If the sender does nothing, the payment will auto-settle at expiry.
                </p>
                <div className="protected-badge">
                  Protected until: {payment.expiresAt.toLocaleString()}
                </div>
              </>
            ) : payment.status === 'SETTLED' ? (
              <>
                <h3>✓ Payment Settled</h3>
                <p>
                  This payment has been settled and the funds are now available in your balance.
                </p>
              </>
            ) : payment.status === 'RECOVERED' ? (
              <>
                <h3>✗ Payment Recovered</h3>
                <p>
                  The sender has recovered this payment. No funds were transferred.
                </p>
              </>
            ) : null}
          </div>
        )}
        
        {/* Transaction history */}
        <div className="transaction-history">
          <h3>Transaction History</h3>
          {events.length === 0 ? (
            <p>No events recorded</p>
          ) : (
            <ul className="event-list">
              {events.map((event) => (
                <li key={event.id} className="event-item">
                  <span className="event-type">{event.type}</span>
                  <span className="event-time">{event.timestamp.toLocaleString()}</span>
                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <pre className="event-metadata">{JSON.stringify(event.metadata, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      
      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>
              Confirm {pendingAction === 'recover' ? 'Recovery' : 'Settlement'}
            </h3>
            
            <div className="modal-body">
              <p>
                Are you sure you want to {pendingAction} this payment?
              </p>
              
              <div className="confirmation-details">
                <div className="detail-row">
                  <span className="label">Amount:</span>
                  <span className="value">{formatAmount(payment.amount)}</span>
                </div>
                
                {pendingAction === 'recover' ? (
                  <div className="detail-row">
                    <span className="label">Result:</span>
                    <span className="value">
                      {formatAmount(payment.amount)} will be returned to your available balance
                    </span>
                  </div>
                ) : (
                  <div className="detail-row">
                    <span className="label">Result:</span>
                    <span className="value">
                      {formatAmount(payment.amount)} will be transferred to {recipient?.displayName}
                    </span>
                  </div>
                )}
                
                <div className="detail-row">
                  <span className="label">Status Change:</span>
                  <span className="value">
                    {payment.status} → {pendingAction === 'recover' ? 'RECOVERED' : 'SETTLED'}
                  </span>
                </div>
                
                <div className="warning-box">
                  <strong>⚠️ Warning:</strong> This action cannot be undone.
                  {pendingAction === 'recover' 
                    ? ' The payment will be cancelled and funds returned to you.'
                    : ' The payment will be finalized and funds transferred to the recipient.'}
                </div>
              </div>
            </div>
            
            <div className="modal-actions">
              <button 
                onClick={() => setShowConfirmModal(false)} 
                className="btn-secondary"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button 
                onClick={confirmAction} 
                className="btn-primary"
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : `Confirm ${pendingAction === 'recover' ? 'Recovery' : 'Settlement'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentDetailPage;
