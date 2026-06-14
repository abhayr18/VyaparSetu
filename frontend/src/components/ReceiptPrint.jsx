/**
 * ReceiptPrint Component
 * Displays a clean invoice details page overlay using the reusable BillTemplate.
 * Provides controls to trigger browser-native printing and crisp PDF export.
 */

import { useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useTranslation } from '../hooks/useTranslation';
import BillTemplate from './BillTemplate';
import {
  formatIndianMobileNumber,
  generateBillWhatsAppMessage,
  createWhatsAppShareUrl,
} from '../utils/whatsappShare';
import { SendIcon, FileIcon, PrintIcon } from './Icons';

export default function ReceiptPrint({ isOpen, onClose, bill }) {
  const { t, language } = useTranslation();
  const [pdfLoading, setPdfLoading] = useState(false);

  if (!isOpen || !bill) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      const element = document.getElementById('receipt-print-area');
      if (!element) return;

      // Capture canvas representation at double scale for high density print output
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 190; // Fit inside page width with 10mm margins on A4 (210mm)
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`bill-${bill.bill_number}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert('Error exporting PDF: ' + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleWhatsAppShare = () => {
    const mobile = bill.customer_mobile;
    const formattedMobile = formatIndianMobileNumber(mobile);

    if (!formattedMobile) {
      alert(t('billing.invalidMobile'));
      return;
    }

    const message = generateBillWhatsAppMessage(bill, language, t);
    const shareUrl = createWhatsAppShareUrl(mobile, message);

    if (!shareUrl) {
      alert(t('billing.invalidMobile'));
      return;
    }

    if (window.confirm(t('billing.shareConfirm'))) {
      window.open(shareUrl, '_blank');
    }
  };

  const isProcessing = pdfLoading;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal modal-lg"
        id="receipt-modal"
        style={{
          width: '100%',
          maxWidth: '850px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '95vh',
        }}
      >
        {/* Modal Scrollable Container */}
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
          {/* Printable Invoice Container */}
          <div id="receipt-print-area">
            <BillTemplate bill={bill} />
          </div>
        </div>

        {/* Modal Action Controls (Hidden when browser print triggers) */}
        <div
          className="modal-actions"
          style={{
            marginTop: 20,
            borderTop: '1px solid var(--color-border)',
            paddingTop: 16,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={isProcessing}
            style={{
              background: '#f1f5f9',
              color: '#334155',
              padding: '9px 16px',
            }}
          >
            {t('common.close')}
          </button>

          {/* WhatsApp sharing */}
          <button
            type="button"
            className="btn"
            onClick={handleWhatsAppShare}
            disabled={isProcessing}
            style={{
              background: '#25D366',
              color: '#fff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
            }}
          >
            <SendIcon /> {t('billing.shareWhatsApp')}
          </button>

          {/* PDF export */}
          <button
            type="button"
            className="btn"
            onClick={handleDownloadPDF}
            disabled={isProcessing}
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
            }}
          >
            {isProcessing ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, borderColor: '#fff', borderTopColor: 'transparent' }} />
                {t('billing.downloading')}
              </>
            ) : (
              <>
                <FileIcon /> {t('billing.downloadPDF')}
              </>
            )}
          </button>

          {/* Browser printing */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePrint}
            disabled={isProcessing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 20px',
            }}
          >
            <PrintIcon /> {t('billing.print')}
          </button>
        </div>
      </div>
    </>
  );
}
