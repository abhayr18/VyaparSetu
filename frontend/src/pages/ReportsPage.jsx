/**
 * ReportsPage — Vyapar Reports-style
 * Pill tabs for report type + KPI icon cards per type + clean data table
 */

import { useReports } from '../hooks/useReports';
import { useTranslation } from '../hooks/useTranslation';
import { useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { PhoneIcon, PrintIcon, AlertIcon, ChartIcon, ReceiptIcon, UsersIcon, LeafIcon, CheckIcon, SaveIcon, FolderIcon } from '../components/Icons';

export default function ReportsPage() {
  const { t } = useTranslation();
  const {
    reportType, setReportType,
    date, setDate,
    startDate, setStartDate,
    endDate, setEndDate,
    data, loading, error, fetchReport
  } = useReports();

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handlePrint = () => window.print();

  const handleDownloadPDF = async () => {
    const reportElement = document.getElementById('report-content-area');
    if (!reportElement) return;

    try {
      setIsGeneratingPdf(true);
      document.body.classList.add('pdf-mode');
      
      // Allow DOM to update
      await new Promise(resolve => setTimeout(resolve, 50));

      const canvas = await html2canvas(reportElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = pdfHeight;
      let position = 0;
      const pageHeight = pdf.internal.pageSize.getHeight();

      // First page
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      // subsequent pages if any
      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`VyapaarSetu_Report_${reportType}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF', err);
    } finally {
      document.body.classList.remove('pdf-mode');
      setIsGeneratingPdf(false);
    }
  };

  const REPORT_TABS = [
    { key: 'daily',      label: t('reports.typeDaily')      },
    { key: 'range',      label: t('reports.typeRange')      },
    { key: 'customers',  label: t('reports.typeCustomers')  },
    { key: 'vegetables', label: t('reports.typeVegetables') },
    { key: 'credit',     label: t('reports.typeCredit')     },
    { key: 'commission', label: t('reports.typeCommission') },
  ];

  // ─── KPI Cards per report type ──────────────────────────────────────────────
  const renderKpiCards = () => {
    if (!data) return null;
    switch (reportType) {
      case 'daily':
      case 'range': {
        const sum = data.summary || {};
        return (
          <div className="kpi-grid no-print" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 20 }}>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-blue"><ReceiptIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">₹{Number(sum.total_sales || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="kpi-label">Total Sales</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-green"><CheckIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">₹{Number(sum.total_paid || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="kpi-label">Paid Amount</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-red"><ChartIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">₹{Number(sum.total_remaining || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="kpi-label">Remaining</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-purple"><SaveIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">₹{Number(sum.total_commission || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="kpi-label">Commission</div>
              </div>
            </div>
          </div>
        );
      }
      case 'customers': {
        if (!Array.isArray(data)) return null;
        const totalPurch = data.reduce((s, c) => s + Number(c.total_purchase || 0), 0);
        const totalBills = data.reduce((s, c) => s + Number(c.total_bills || 0), 0);
        const totalDues  = data.reduce((s, c) => s + Number(c.total_pending_credit || 0), 0);
        return (
          <div className="kpi-grid no-print" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 20 }}>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-blue"><UsersIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">{data.length}</div>
                <div className="kpi-label">Total Customers</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-green"><ReceiptIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">₹{totalPurch.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="kpi-label">Total Purchases</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-teal"><ChartIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">{totalBills}</div>
                <div className="kpi-label">Bills Generated</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-red"><AlertIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">₹{totalDues.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="kpi-label">Outstanding Dues</div>
              </div>
            </div>
          </div>
        );
      }
      case 'vegetables': {
        if (!Array.isArray(data)) return null;
        const totalVol = data.reduce((s, v) => s + Number(v.total_quantity || 0), 0);
        const totalVal = data.reduce((s, v) => s + Number(v.total_sales || 0), 0);
        return (
          <div className="kpi-grid no-print" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-green"><LeafIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">₹{totalVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="kpi-label">Vegetable Revenue</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-teal"><ChartIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">{totalVol.toFixed(1)}</div>
                <div className="kpi-label">Total Volume Sold</div>
              </div>
            </div>
          </div>
        );
      }
      case 'credit': {
        const sum = data.summary || {};
        return (
          <div className="kpi-grid no-print" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 20 }}>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-orange"><ReceiptIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">₹{Number(sum.total_outstanding || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="kpi-label">{t('credit.totalOutstanding')}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-red"><ChartIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">₹{Number(sum.credit_added || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="kpi-label">{t('credit.todayAdded')}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-green"><CheckIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">₹{Number(sum.credit_recovered || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="kpi-label">{t('credit.todayRecovered')}</div>
              </div>
            </div>
          </div>
        );
      }
      case 'commission': {
        const totalComm = Number(data.total_commission || 0);
        const billCount = data.billWise?.length || 0;
        return (
          <div className="kpi-grid no-print" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-purple"><SaveIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">₹{totalComm.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div className="kpi-label">{t('reports.totalCommission')}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon-box kpi-icon-blue"><ReceiptIcon style={{ width: '18px', height: '18px' }} /></div>
              <div className="kpi-content">
                <div className="kpi-value">{billCount}</div>
                <div className="kpi-label">Commission Invoices</div>
              </div>
            </div>
          </div>
        );
      }
      default: return null;
    }
  };

  // ─── Table ──────────────────────────────────────────────────────────────────
  const renderTableData = () => {
    if (!data) return null;
    switch (reportType) {
      case 'daily':
      case 'range': {
        const bills = data.bills || [];
        return (
          <table className="data-table">
            <thead>
              <tr>
                <th className="table-th">{t('billing.billNumber')}</th>
                <th className="table-th">{t('billing.customer')}</th>
                <th className="table-th">{t('billing.date')}</th>
                <th className="table-th" style={{ textAlign: 'right' }}>{t('billing.total')}</th>
                <th className="table-th" style={{ textAlign: 'right' }}>{t('billing.paid')}</th>
                <th className="table-th">{t('billing.status')}</th>
              </tr>
            </thead>
            <tbody>
              {bills.map(bill => (
                <tr className="table-row" key={bill.id}>
                  <td className="table-cell" style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.82rem' }}>{bill.bill_number}</td>
                  <td className="table-cell">
                    <div style={{ fontWeight: 600 }}>{bill.customer_name}</div>
                    <div className="text-muted text-sm">{bill.customer_mobile}</div>
                  </td>
                  <td className="table-cell" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{new Date(bill.date).toLocaleDateString('en-IN')}</td>
                  <td className="table-cell" style={{ fontWeight: 700, textAlign: 'right' }}>₹{Number(bill.final_amount).toFixed(2)}</td>
                  <td className="table-cell" style={{ textAlign: 'right', color: 'var(--color-success)' }}>₹{Number(bill.paid_amount).toFixed(2)}</td>
                  <td className="table-cell">
                    <span className={`badge badge-${bill.payment_status === 'Paid' ? 'success' : bill.payment_status === 'Partial' ? 'warning' : 'error'}`}>
                      {t(`billing.status${bill.payment_status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--color-bg-light)', fontWeight: 700 }}>
                <td className="table-cell" colSpan={3} style={{ textAlign: 'right' }}>Total:</td>
                <td className="table-cell" style={{ textAlign: 'right' }}>₹{bills.reduce((s, b) => s + Number(b.final_amount), 0).toFixed(2)}</td>
                <td className="table-cell" style={{ textAlign: 'right', color: 'var(--color-success)' }}>₹{bills.reduce((s, b) => s + Number(b.paid_amount), 0).toFixed(2)}</td>
                <td className="table-cell"></td>
              </tr>
            </tfoot>
          </table>
        );
      }
      case 'customers': {
        if (!Array.isArray(data)) return null;
        return (
          <table className="data-table">
            <thead>
              <tr>
                <th className="table-th">{t('customers.name')}</th>
                <th className="table-th">{t('customers.mobile')}</th>
                <th className="table-th" style={{ textAlign: 'right' }}>{t('billing.totalBills')}</th>
                <th className="table-th" style={{ textAlign: 'right' }}>Total Purchases</th>
                <th className="table-th" style={{ textAlign: 'right' }}>Total Paid</th>
                <th className="table-th">{t('credit.balanceAfter')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map(c => (
                <tr className="table-row" key={c.customer_id}>
                  <td className="table-cell" style={{ fontWeight: 600 }}>{c.customer_name}</td>
                  <td className="table-cell" style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PhoneIcon style={{ width: '12px', height: '12px' }} /> {c.customer_mobile}</span>
                  </td>
                  <td className="table-cell" style={{ textAlign: 'right' }}>{c.total_bills}</td>
                  <td className="table-cell" style={{ fontWeight: 600, textAlign: 'right' }}>₹{Number(c.total_purchase).toFixed(2)}</td>
                  <td className="table-cell" style={{ color: 'var(--color-success)', textAlign: 'right' }}>₹{Number(c.total_paid).toFixed(2)}</td>
                  <td className="table-cell">
                    <span className={`badge ${c.total_pending_credit > 0 ? 'badge-warning' : 'badge-success'}`}>
                      ₹{Number(c.total_pending_credit).toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--color-bg-light)', fontWeight: 700 }}>
                <td className="table-cell" colSpan={2} style={{ textAlign: 'right' }}>Total:</td>
                <td className="table-cell" style={{ textAlign: 'right' }}>{data.reduce((s, c) => s + Number(c.total_bills), 0)}</td>
                <td className="table-cell" style={{ textAlign: 'right' }}>₹{data.reduce((s, c) => s + Number(c.total_purchase), 0).toFixed(2)}</td>
                <td className="table-cell" style={{ color: 'var(--color-success)', textAlign: 'right' }}>₹{data.reduce((s, c) => s + Number(c.total_paid), 0).toFixed(2)}</td>
                <td className="table-cell" style={{ color: 'var(--color-error)' }}>
                  <span className="badge badge-error" style={{ background: 'transparent', padding: 0 }}>
                    ₹{data.reduce((s, c) => s + Number(c.total_pending_credit), 0).toFixed(2)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        );
      }
      case 'vegetables': {
        if (!Array.isArray(data)) return null;
        return (
          <table className="data-table">
            <thead>
              <tr>
                <th className="table-th">{t('vegetables.name')}</th>
                <th className="table-th" style={{ textAlign: 'right' }}>Volume Sold</th>
                <th className="table-th">Unit</th>
                <th className="table-th" style={{ textAlign: 'right' }}>Total Revenue</th>
                <th className="table-th" style={{ textAlign: 'right' }}>Bills Count</th>
              </tr>
            </thead>
            <tbody>
              {data.map(v => (
                <tr className="table-row" key={v.vegetable_id}>
                  <td className="table-cell" style={{ fontWeight: 600 }}>{v.vegetable_name}</td>
                  <td className="table-cell" style={{ textAlign: 'right', fontWeight: 600 }}>{Number(v.total_quantity).toFixed(2)}</td>
                  <td className="table-cell" style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{v.vegetable_unit ? t(`vegetables.units.${v.vegetable_unit}`) : ''}</td>
                  <td className="table-cell" style={{ fontWeight: 700, textAlign: 'right', color: 'var(--color-primary)' }}>₹{Number(v.total_sales).toFixed(2)}</td>
                  <td className="table-cell" style={{ textAlign: 'right' }}>{v.total_bills}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--color-bg-light)', fontWeight: 700 }}>
                <td className="table-cell" style={{ textAlign: 'right' }}>Total:</td>
                <td className="table-cell" style={{ textAlign: 'right' }}>{data.reduce((s, v) => s + Number(v.total_quantity), 0).toFixed(2)}</td>
                <td className="table-cell"></td>
                <td className="table-cell" style={{ textAlign: 'right', color: 'var(--color-primary)' }}>₹{data.reduce((s, v) => s + Number(v.total_sales), 0).toFixed(2)}</td>
                <td className="table-cell" style={{ textAlign: 'right' }}>{data.reduce((s, v) => s + Number(v.total_bills), 0)}</td>
              </tr>
            </tfoot>
          </table>
        );
      }
      case 'credit': {
        const list = data.customers || [];
        return (
          <table className="data-table">
            <thead>
              <tr>
                <th className="table-th">{t('customers.name')}</th>
                <th className="table-th">{t('customers.mobile')}</th>
                <th className="table-th" style={{ textAlign: 'right' }}>{t('credit.balanceAfter')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <tr className="table-row" key={c.id}>
                  <td className="table-cell" style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="table-cell" style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PhoneIcon style={{ width: '12px', height: '12px' }} /> {c.mobile}</span>
                  </td>
                  <td className="table-cell" style={{ textAlign: 'right' }}>
                    <span className="badge badge-warning">₹{Number(c.credit_balance).toFixed(2)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--color-bg-light)', fontWeight: 700 }}>
                <td className="table-cell" colSpan={2} style={{ textAlign: 'right' }}>Total Outstanding:</td>
                <td className="table-cell" style={{ textAlign: 'right' }}>
                  <span className="badge badge-warning" style={{ background: 'transparent', padding: 0 }}>
                    ₹{list.reduce((s, c) => s + Number(c.credit_balance), 0).toFixed(2)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        );
      }
      case 'commission': {
        const list = data.billWise || [];
        return (
          <table className="data-table">
            <thead>
              <tr>
                <th className="table-th">{t('billing.billNumber')}</th>
                <th className="table-th">{t('billing.customer')}</th>
                <th className="table-th">{t('billing.date')}</th>
                <th className="table-th" style={{ textAlign: 'right' }}>{t('billing.total')}</th>
                <th className="table-th" style={{ textAlign: 'right' }}>{t('reports.totalCommission')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <tr className="table-row" key={c.bill_id}>
                  <td className="table-cell" style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.82rem' }}>{c.bill_number}</td>
                  <td className="table-cell" style={{ fontWeight: 600 }}>{c.customer_name}</td>
                  <td className="table-cell" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{new Date(c.date).toLocaleDateString('en-IN')}</td>
                  <td className="table-cell" style={{ textAlign: 'right' }}>₹{Number(c.final_amount).toFixed(2)}</td>
                  <td className="table-cell" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>₹{Number(c.commission_amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--color-bg-light)', fontWeight: 700 }}>
                <td className="table-cell" colSpan={3} style={{ textAlign: 'right' }}>Total:</td>
                <td className="table-cell" style={{ textAlign: 'right' }}>₹{list.reduce((s, c) => s + Number(c.final_amount), 0).toFixed(2)}</td>
                <td className="table-cell" style={{ textAlign: 'right', color: 'var(--color-primary)' }}>₹{list.reduce((s, c) => s + Number(c.commission_amount), 0).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        );
      }
      default: return null;
    }
  };

  const hasData = () => {
    if (!data) return false;
    if (reportType === 'daily' || reportType === 'range') return data.bills && data.bills.length > 0;
    if (reportType === 'credit') return data.customers && data.customers.length > 0;
    if (reportType === 'commission') return data.billWise && data.billWise.length > 0;
    return data.length > 0;
  };

  return (
    <div className="reports-page">
      <style dangerouslySetInnerHTML={{ __html: `
        .print-header { display: none; }
        @media print {
          .sidebar, #main-sidebar, .topbar, .reports-selectors, .reports-filters, .no-print { display: none !important; visibility: hidden !important; }
          main, .content, .reports-page { margin: 0 !important; padding: 0 !important; background: #fff !important; width: 100% !important; }
          .card { border: none !important; box-shadow: none !important; background: #fff !important; padding: 0 !important; }
          body { color: #000 !important; background: #fff !important; }
          .print-header { display: block !important; }
        }
        body.pdf-mode .sidebar, body.pdf-mode #main-sidebar, body.pdf-mode .topbar, body.pdf-mode .reports-selectors, body.pdf-mode .reports-filters, body.pdf-mode .no-print { display: none !important; visibility: hidden !important; }
        body.pdf-mode main, body.pdf-mode .content, body.pdf-mode .reports-page { margin: 0 !important; padding: 0 !important; background: #fff !important; width: 100% !important; }
        body.pdf-mode .card { border: none !important; box-shadow: none !important; background: #fff !important; padding: 0 !important; }
        body.pdf-mode { color: #000 !important; background: #fff !important; }
        body.pdf-mode .print-header { display: block !important; }
      `}} />

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="page-header-bar no-print">
        <div>
          <h1 className="page-title">{t('reports.title')}</h1>
          <p className="page-desc">{t('reports.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={fetchReport} disabled={loading}>↻ Refresh</button>
          <button className="btn btn-primary" onClick={handleDownloadPDF} disabled={!hasData() || isGeneratingPdf} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {isGeneratingPdf ? <span className="spinner" style={{ width: 15, height: 15 }} /> : <FolderIcon style={{ width: '15px', height: '15px' }} />} 
            {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* ── Report Type Tabs (Vyapar-style pill tabs) ──────────────────────── */}
      <div className="report-tabs reports-selectors no-print">
        {REPORT_TABS.map(tab => (
          <button key={tab.key} className={`report-tab${reportType === tab.key ? ' active' : ''}`} onClick={() => {
            if (reportType !== tab.key) {
              setReportType(tab.key);
            }
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Date Filters ──────────────────────────────────────────────────── */}
      <div className="card reports-filters no-print" style={{ display: 'flex', gap: 16, alignItems: 'flex-end', padding: '14px 20px', marginBottom: 20 }}>
        {(reportType === 'daily' || reportType === 'credit') && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('reports.singleDate')}</label>
            <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} style={{ width: 'auto' }} />
          </div>
        )}
        {reportType !== 'daily' && reportType !== 'credit' && (
          <>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('reports.startDate')}</label>
              <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: 'auto' }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('reports.endDate')}</label>
              <input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: 'auto' }} />
            </div>
          </>
        )}
        <button className="btn btn-primary" onClick={fetchReport} disabled={loading}>
          {loading ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Loading…</> : t('reports.generate')}
        </button>
      </div>

      {/* ── Report Content Area (for PDF and Print) ──────────────────────── */}
      <div id="report-content-area" style={{ padding: '0px 20px', background: '#fff' }}>
        {/* Print Header (print-only) */}
        <div className="print-header">
          <h2 style={{ margin: '0 0 4px 0' }}>{t('common.appName')}</h2>
          <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#555' }}>
            <strong>Report:</strong> {t(`reports.type${reportType.charAt(0).toUpperCase() + reportType.slice(1)}`)} |&nbsp;
            {reportType === 'daily' || reportType === 'credit'
              ? `Date: ${new Date(date).toLocaleDateString('en-IN')}`
              : `Range: ${new Date(startDate).toLocaleDateString('en-IN')} to ${new Date(endDate).toLocaleDateString('en-IN')}`}
          </p>
          <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '10px 0 20px 0' }} />
        </div>

        {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
        {renderKpiCards()}

        {/* ── Data Table ────────────────────────────────────────────────────── */}
        <div className="card print-section" style={{ padding: 0, overflow: 'hidden', boxShadow: 'none' }}>
          {error && !loading && (
            <div className="table-error no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
              <AlertIcon /> {error}
            </div>
          )}
          {loading && <div className="table-message no-print"><span className="spinner" style={{ margin: 'auto' }} /></div>}
          {!loading && !error && !hasData() && (
            <div className="table-message">
              <ChartIcon style={{ width: '2rem', height: '2rem', color: 'var(--color-text-muted)', marginBottom: 10 }} />
              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{t('reports.noData')}</p>
            </div>
          )}
          {!loading && !error && hasData() && (
            <div className="table-wrapper">{renderTableData()}</div>
          )}
        </div>
      </div>
    </div>
  );
}
