/**
 * TransactionsPage Component
 * Main page integrating Module A (Transaction Entry) and Module B (Daily Purchase History).
 */

import { useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useTransactions } from '../hooks/useTransactions';
import TransactionEntry from '../components/TransactionEntry';
import CustomerDailyPurchase from '../components/CustomerDailyPurchase';

function ToastNotification({ toast, onClose, t }) {
  if (!toast) return null;
  return (
    <div
      className={`toast toast-${toast.type || 'success'}`}
      id="transaction-toast"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 18px',
        background: '#15803d',
        color: 'white',
        borderRadius: '6px',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)',
        fontWeight: 600
      }}
    >
      <span>✅ {t(`transactions.${toast.text}`) || toast.text}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontSize: '1rem',
          padding: '0 4px'
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default function TransactionsPage() {
  const { t } = useTranslation();

  const {
    customers,
    vegetables,
    loading,
    error,
    toastMessage,
    setToastMessage,
    activeCustomerId,
    setActiveCustomerId,
    dateFilterType,
    setDateFilterType,
    selectedDate,
    setSelectedDate,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dailyData,
    historyLoading,
    createTransaction,
    generateBill,
    deleteTransaction
  } = useTransactions();

  // Auto hide toast after 3 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage, setToastMessage]);

  return (
    <div className="page-container" id="transactions-page">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 className="page-title">{t('transactions.title')}</h1>
          <p className="page-subtitle">{t('transactions.subtitle')}</p>
        </div>
      </div>

      {/* General Error Banner */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '6px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* MODULE A: Customer-wise Vegetable Transaction Entry */}
      <TransactionEntry
        customers={customers}
        vegetables={vegetables}
        onSubmitTransaction={createTransaction}
        loading={loading}
        onCustomerSelectForHistory={(cId) => setActiveCustomerId(cId)}
      />

      {/* MODULE B: Customer Daily Purchase & Transaction History */}
      <CustomerDailyPurchase
        customers={customers}
        activeCustomerId={activeCustomerId}
        onSelectCustomer={(cId) => setActiveCustomerId(cId)}
        dateFilterType={dateFilterType}
        onChangeDateFilterType={setDateFilterType}
        selectedDate={selectedDate}
        onChangeSelectedDate={setSelectedDate}
        startDate={startDate}
        onChangeStartDate={setStartDate}
        endDate={endDate}
        onChangeEndDate={setEndDate}
        dailyData={dailyData}
        historyLoading={historyLoading}
        onDeleteTransaction={deleteTransaction}
        onGenerateBill={generateBill}
      />


      {/* Non-blocking Toast Notification */}
      <ToastNotification
        toast={toastMessage}
        onClose={() => setToastMessage(null)}
        t={t}
      />
    </div>
  );
}
