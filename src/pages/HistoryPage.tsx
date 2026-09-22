import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Payment, PaymentStatus, formatAmount } from '../types';

const HistoryPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'settled' | 'recovered'>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    loadPayments();
  }, [user, filter]);

  const loadPayments = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const paymentsRef = collection(db, 'payments');
      
      const [sentSnapshot, receivedSnapshot] = await Promise.all([
        getDocs(query(paymentsRef, where('senderUserId', '==', user.uid), orderBy('createdAt', 'desc'))),
        getDocs(query(paymentsRef, where('recipientUserId', '==', user.uid), orderBy('createdAt', 'desc'))),
      ]);
      const paymentDocs = [...sentSnapshot.docs, ...receivedSnapshot.docs]
        .filter((doc, index, docs) => docs.findIndex((candidate) => candidate.id === doc.id) === index);
      const allPayments = paymentDocs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        expiresAt: doc.data().expiresAt?.toDate() || new Date(),
      })) as Payment[];

      const userPayments = allPayments;

      // Apply status filter
      let filtered = userPayments;
      if (filter === 'active') {
        filtered = userPayments.filter(p => 
          ['CREATED', 'PROTECTED', 'ACKNOWLEDGED'].includes(p.status)
        );
      } else if (filter === 'settled') {
        filtered = userPayments.filter(p => p.status === 'SETTLED');
      } else if (filter === 'recovered') {
        filtered = userPayments.filter(p => p.status === 'RECOVERED');
      }

      setPayments(filtered);
    } catch (err: any) {
      console.error('Error loading payments:', err);
      setError(err.message || 'Failed to load payment history');
    } finally {
      setLoading(false);
    }
  };

  const getStatusClass = (status: PaymentStatus): string => {
    switch (status) {
      case 'PROTECTED':
        return 'status-protected';
      case 'ACKNOWLEDGED':
        return 'status-acknowledged';
      case 'SETTLED':
        return 'status-settled';
      case 'RECOVERED':
        return 'status-recovered';
      case 'EXPIRED':
        return 'status-expired';
      default:
        return 'status-created';
    }
  };

  const getRole = (payment: Payment): 'sender' | 'recipient' => {
    return (payment.senderId || (payment as any).senderUserId) === user?.uid ? 'sender' : 'recipient';
  };

  if (loading) {
    return <div className="page-container"><div className="loading">Loading history...</div></div>;
  }

  return (
    <div className="page-container">
      <div className="history-page">
        <h2>Transaction History</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <div className="filter-buttons">
          <button 
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={filter === 'active' ? 'active' : ''}
            onClick={() => setFilter('active')}
          >
            Active
          </button>
          <button 
            className={filter === 'settled' ? 'active' : ''}
            onClick={() => setFilter('settled')}
          >
            Settled
          </button>
          <button 
            className={filter === 'recovered' ? 'active' : ''}
            onClick={() => setFilter('recovered')}
          >
            Recovered
          </button>
        </div>
        
        {payments.length === 0 ? (
          <div className="empty-state">
            <p>No transactions found</p>
            <button onClick={() => navigate('/send')} className="btn-primary">
              Send Your First Payment
            </button>
          </div>
        ) : (
          <div className="payments-list">
            {payments.map((payment) => (
              <div 
                key={payment.id} 
                className="payment-card"
                onClick={() => navigate(`/payment/${payment.id}`)}
              >
                <div className="payment-header">
                  <div className="payment-role">
                    {getRole(payment) === 'sender' ? 'Sent to' : 'Received from'}
                    <strong>
                      {getRole(payment) === 'sender' 
                        ? payment.recipientUpiId || payment.recipientId 
                        : payment.senderUpiId || payment.senderId}
                    </strong>
                  </div>
                  <span className={`status-badge ${getStatusClass(payment.status)}`}>
                    {payment.status}
                  </span>
                </div>
                
                <div className="payment-body">
                  <div className="payment-amount-display">
                    {formatAmount(payment.amount)}
                  </div>
                  
                  <div className="payment-meta">
                    <span className="date">{payment.createdAt.toLocaleDateString()}</span>
                    <span className="time">{payment.createdAt.toLocaleTimeString()}</span>
                  </div>
                  
                  {payment.description && (
                    <div className="payment-description">{payment.description}</div>
                  )}
                  
                  {(payment.status === 'PROTECTED' || payment.status === 'ACKNOWLEDGED') && (
                    <div className="protection-info">
                      <span className="warning-icon">⚠️</span>
                      <span>
                        {getRole(payment) === 'sender' 
                          ? 'You can recover or confirm settlement'
                          : 'Funds not yet spendable'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        <button onClick={() => navigate('/dashboard')} className="btn-secondary">
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default HistoryPage;
