/**
 * TodayBillModal Component
 * Displays the consolidated Today's Bill with options to:
 * 1. 📱 Send on WhatsApp (Itemized Marathi/English message with wa.me link)
 * 2. 🖨️ Print Bill (Thermal / A4 Receipt Print)
 * 3. 📄 Download PDF
 */

import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useTranslation } from '../hooks/useTranslation';
import { generateBillWhatsAppMessage, createWhatsAppShareUrl } from '../utils/whatsappShare';

export default function TodayBillModal({ isOpen, onClose, bill }) {
  const { t, language } = useTranslation();
  const printRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  if (!isOpen || !bill) return null;

  const items = bill.items || [];
  const customerName = bill.customer_name || bill.customer?.name || '';
  const customerMobile = bill.customer_mobile || bill.customer?.mobile || '';

  // Generate WhatsApp Share URL
  const waMessage = generateBillWhatsAppMessage(bill, language, t);
  const waUrl = createWhatsAppShareUrl(customerMobile, waMessage);

  function handleSendWhatsApp() {
    if (!waUrl) {
      alert(t('billing.invalidMobile') || 'Invalid customer mobile number for WhatsApp');
      return;
    }
    window.open(waUrl, '_blank');
  }

  function handlePrint() {
    window.print();
  }

  async function handleDownloadPDF() {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`${bill.bill_number || 'bill'}.pdf`);
    } catch (err) {
      console.error('PDF download error:', err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        zIndex: 9990,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        className="modal-container card"
        style={{
          width: '100%',
          maxWidth: '650px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'white',
          borderRadius: '10px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
          padding: '1.5rem',
          position: 'relative'
        }}
      >
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', fontWeight: 800 }}>
              📄 {t('billing.receiptTitle')} ({bill.bill_number})
            </h2>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              {t('dashboard.date')}: {bill.date}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
          >
            ✕
          </button>
        </div>

        {/* Print / Export Content Area */}
        <div ref={printRef} style={{ background: '#fafafa', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '1.25rem' }}>
          {/* Shop & Customer Info Header */}
          <div style={{ textTransform: 'uppercase', textAlign: 'center', marginBottom: '1rem', borderBottom: '2px dashed #cbd5e1', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#16a34a', fontWeight: 800 }}>
              🌿 VyaparSetu Mandai Vendor
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Vegetable Market Bill</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '0.9rem' }}>
            <div>
              <strong style={{ color: '#0f172a' }}>{t('billing.customer')}:</strong> {customerName}<br />
              <strong style={{ color: '#0f172a' }}>{t('customers.mobile')}:</strong> {customerMobile || 'N/A'}
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong style={{ color: '#0f172a' }}>{t('billing.billNumber')}:</strong> {bill.bill_number}<br />
              <strong style={{ color: '#0f172a' }}>{t('dashboard.date')}:</strong> {bill.date}
            </div>
          </div>

          {/* Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#e2e8f0', color: '#334155', textAlign: 'left' }}>
                <th style={{ padding: '6px 10px' }}>#</th>
                <th style={{ padding: '6px 10px' }}>{t('billing.vegetable')}</th>
                <th style={{ padding: '6px 10px' }}>{t('billing.quantity')}</th>
                <th style={{ padding: '6px 10px' }}>{t('billing.rate')}</th>
                <th style={{ padding: '6px 10px', textAlign: 'right' }}>{t('billing.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '6px 10px' }}>{idx + 1}</td>
                  <td style={{ padding: '6px 10px', fontWeight: 600 }}>{item.vegetable_name}</td>
                  <td style={{ padding: '6px 10px' }}>{item.quantity} {item.vegetable_unit || 'kg'}</td>
                  <td style={{ padding: '6px 10px' }}>₹{item.rate}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>₹{Number(item.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Bill Totals Summary */}
          <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '0.75rem', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('billing.grandTotal')}:</span>
              <strong>₹{Number(bill.subtotal).toFixed(2)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0284c7' }}>
              <span>{t('billing.commissionAmount')}:</span>
              <strong>+₹{Number(bill.commission_amount).toFixed(2)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', color: '#16a34a', fontWeight: 800, marginTop: '4px' }}>
              <span>{t('transactions.finalAmount')}:</span>
              <span>₹{Number(bill.final_amount).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', marginTop: '4px' }}>
              <span>{t('billing.paid')}:</span>
              <span>₹{Number(bill.paid_amount || 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c', fontWeight: 700 }}>
              <span>{t('billing.remainingAmount')}:</span>
              <span>₹{Number(bill.remaining_amount || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons Bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleSendWhatsApp}
            style={{ background: '#25D366', color: 'white', borderColor: '#25D366', fontWeight: 700 }}
          >
            📱 {t('billing.shareWhatsApp')}
          </button>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handlePrint}
            >
              🖨️ {t('billing.print')}
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownloadPDF}
              disabled={downloading}
            >
              📄 {downloading ? t('billing.downloading') : t('billing.downloadPDF')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
