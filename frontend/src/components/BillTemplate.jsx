import { Fragment, useEffect } from 'react';
import useSettings from '../hooks/useSettings';
import { useTranslation } from '../hooks/useTranslation';
import {
  grossItems,
  groupItemsByDate,
  formatBillDate,
  formatBillPeriod,
} from '../utils/billDisplay';

// Reusable Marathi combined numbers lookup (20-99)
const marathiCombined = {
  20: 'वीस', 21: 'एकवीस', 22: 'बावीस', 23: 'तेवीस', 24: 'चोवीस', 25: 'पंचवीस', 26: 'सव्वीस', 27: 'सत्तावीस', 28: 'अठ्ठावीस', 29: 'एकोणतीस',
  30: 'तीस', 31: 'एकतीस', 32: 'बत्तीस', 33: 'तेहतीस', 34: 'चौतीस', 35: 'पस्तीस', 36: 'छत्तीस', 37: 'सदुतीस', 38: 'अडुतीस', 39: 'एकोणचाळीस',
  40: 'चाळीस', 41: 'एकचाळीस', 42: 'बेचाळीस', 43: 'तेचाळीस', 44: 'चव्वेचाळीस', 45: 'पंचेचाळीस', 46: 'शेचाळीस', 47: 'सत्तेचाळीस', 48: 'अठ्ठेचाळीस', 49: 'एकोणपन्नास',
  50: 'पन्नास', 51: 'एक्यावन्न', 52: 'बावन', 53: 'त्रेपन्न', 54: 'चौपन', 55: 'पंचावन्न', 56: 'छपन्न', 57: 'सत्तावन्न', 58: 'अठ्ठावन्न', 59: 'एकोणसाठ',
  60: 'साठ', 61: 'एकसठ', 62: 'बासठ', 63: 'तेसठ', 64: 'चौसठ', 65: 'पासठ', 66: 'सहासठ', 67: 'सदुसठ', 68: 'अडुसठ', 69: 'एकोणसत्तर',
  70: 'सत्तर', 71: 'एकहत्तर', 72: 'बाहत्तर', 73: 'त्र्याहत्तर', 74: 'चौऱ्याहत्तर', 75: 'पंच्याहत्तर', 76: 'शहात्तर', 77: 'सत्यात्तर', 78: 'अठ्ठ्यात्तर', 79: 'एकोणऐंशी',
  80: 'ऐंशी', 81: 'एक्याऐंशी', 82: 'ब्याऐंशी', 83: 'त्र्याऐंशी', 84: 'चौऱ्याऐंशी', 85: 'पंच्याऐंशी', 86: 'शहाऐंशी', 87: 'सत्याऐंशी', 88: 'अठ्ठाऐंशी', 89: 'एकोणनव्वद',
  90: 'नव्वद', 91: 'एक्याण्णव', 92: 'बाण्णव', 93: 'त्र्याण्णव', 94: 'चौऱ्याण्णव', 95: 'पंच्याण्णव', 96: 'शहाण्णव', 97: 'सत्याण्णव', 98: 'अठ्ठ्याण्णव', 99: 'नऊ्याण्णव'
};

function convertToMarathiWords(num) {
  const ones = ['', 'एक', 'दोन', 'तीन', 'चार', 'पाच', 'सहा', 'सात', 'आठ', 'नऊ', 'दहा', 
                'अकरा', 'बारा', 'तेरा', 'चौदा', 'पंधरा', 'सोळा', 'सतरा', 'अठरा', 'एकोणीस'];
  const tens = ['', '', 'वीस', 'तीस', 'चाळीस', 'पन्नास', 'साठ', 'सत्तर', 'ऐंशी', 'नव्वद'];
  
  if (num === 0) return '';
  if (num < 20) return ones[num];
  if (num < 100) {
    if (marathiCombined[num]) return marathiCombined[num];
    const t = Math.floor(num / 10);
    const o = num % 10;
    return tens[t] + (o > 0 ? ones[o] : '');
  }
  if (num < 1000) {
    const h = Math.floor(num / 100);
    const r = num % 100;
    const hWord = h === 1 ? 'शे' : ones[h] + 'शे';
    const hWordFull = h === 1 && r === 0 ? 'शंभर' : hWord;
    return hWordFull + (r > 0 ? ' ' + convertToMarathiWords(r) : '');
  }
  if (num < 100000) {
    const th = Math.floor(num / 1000);
    const r = num % 1000;
    return convertToMarathiWords(th) + ' हजार' + (r > 0 ? ' ' + convertToMarathiWords(r) : '');
  }
  const lakh = Math.floor(num / 100000);
  const r = num % 100000;
  return convertToMarathiWords(lakh) + ' लाख' + (r > 0 ? ' ' + convertToMarathiWords(r) : '');
}

function convertToEnglishWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
                'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  if (num === 0) return '';
  if (num < 20) return ones[num];
  if (num < 100) {
    const t = Math.floor(num / 10);
    const o = num % 10;
    return tens[t] + (o > 0 ? ' ' + ones[o] : '');
  }
  if (num < 1000) {
    const h = Math.floor(num / 100);
    const r = num % 100;
    return ones[h] + ' Hundred' + (r > 0 ? ' and ' + convertToEnglishWords(r) : '');
  }
  if (num < 100000) {
    const th = Math.floor(num / 1000);
    const r = num % 1000;
    return convertToEnglishWords(th) + ' Thousand' + (r > 0 ? ' ' + convertToEnglishWords(r) : '');
  }
  const lakh = Math.floor(num / 100000);
  const r = num % 100000;
  return convertToEnglishWords(lakh) + ' Lakh' + (r > 0 ? ' ' + convertToEnglishWords(r) : '');
}

function getAmountInWords(amount, isMarathi) {
  const val = Math.floor(amount);
  if (val === 0) return isMarathi ? 'शून्य रुपये फक्त' : 'Zero Rupees Only';
  return isMarathi 
    ? convertToMarathiWords(val) + ' रुपये फक्त' 
    : convertToEnglishWords(val) + ' Rupees Only';
}

export default function BillTemplate({ bill }) {
  const { t, language } = useTranslation();
  const { settings, refetch } = useSettings();

  useEffect(() => {
    refetch();
  }, [refetch]);

  if (!bill) return null;

  const discountAmount = bill.discount_amount || 0;
  const finalAmount = bill.final_amount || 0;
  const paidAmount = bill.paid_amount || 0;
  const remainingAmount = bill.remaining_amount || 0;

  // Previous outstanding balance before this bill:
  // Derived from the customer's total outstanding balance minus what this bill left unpaid.
  const customerBalance = Number(bill.customer_credit_balance || 0);
  const previousBalance = Math.max(0, Math.round((customerBalance - remainingAmount) * 100) / 100);
  const totalPayableAmount = Math.round((finalAmount + previousBalance) * 100) / 100;
  const netDueAmount = Math.round((previousBalance + remainingAmount) * 100) / 100;

  const isMarathi = language === 'mr';

  // Commission is folded into the item rates and never shown as a line. The subtotal
  // shown is therefore the grossed one, so the column above it adds up to it and
  // subtotal − discount + hamali + transport still lands on Total Payable.
  const displayItems = grossItems(bill.items, bill);

  // Always group items datewise so every bill displays clear per-day breakdown
  const dayGroups = groupItemsByDate(displayItems, bill.date);
  const periodLabel = formatBillPeriod(bill, isMarathi);

  const themeColor = isMarathi ? '#b71c1c' : '#1a6b3c'; // Traditional Red Ink for Marathi APMC, Slate Green for English

  const cellBorder = `1.5px solid ${themeColor}`;

  /** One vegetable line. Shared by the flat and the datewise renderings. */
  function renderItemRow(item, key) {
    const isKg = item.vegetable_unit === 'kg';
    return (
      <tr key={key} style={{ borderBottom: `1px solid ${themeColor}` }}>
        <td style={{ padding: '8px', borderRight: cellBorder, fontWeight: '600' }}>
          {item.vegetable_name}
        </td>
        {/* unit quantity column */}
        <td style={{ padding: '8px', borderRight: cellBorder, textAlign: 'center' }}>
          {!isKg ? `${item.quantity} ${item.vegetable_unit ? t(`vegetables.units.${item.vegetable_unit}`) : ''}` : '—'}
        </td>
        {/* weight column */}
        <td style={{ padding: '8px', borderRight: cellBorder, textAlign: 'right' }}>
          {isKg ? `${item.quantity} kg` : '—'}
        </td>
        {/* rate */}
        <td style={{ padding: '8px', borderRight: cellBorder, textAlign: 'right' }}>
          ₹{Number(item.rate).toFixed(2)}
        </td>
        {/* amount */}
        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
          ₹{Number(item.total).toFixed(2)}
        </td>
      </tr>
    );
  }

  // Extract market location / city
  const city = settings.address
    ? settings.address.split(',').pop().trim()
    : (isMarathi ? 'फलटण' : 'Phaltan');

  return (
    <div
      className="bill-template"
      style={{
        fontFamily: isMarathi ? '"Noto Sans Devanagari", sans-serif' : '"Inter", sans-serif',
        color: '#000',
        background: '#fff',
        padding: '20px',
        lineHeight: '1.4',
        border: `3px double ${themeColor}`,
        borderRadius: '0px', // Paper receipts are cut straight
        width: '100%',
        maxWidth: '750px',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      {/* Devotion Headers (॥ हरि ॐ ॥  ॥ श्रीराम ॥  ॥ अंबा ॥) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.82rem',
          fontWeight: 'bold',
          color: themeColor,
          marginBottom: '6px',
        }}
      >
        <span>{isMarathi ? '॥ हरि ॐ ॥' : '|| Hari Om ||'}</span>
        <span>{isMarathi ? '॥ श्रीराम ॥' : '|| Shri Ram ||'}</span>
        <span>{isMarathi ? '॥ अंबा ॥' : '|| Amba ||'}</span>
      </div>

      {/* APMC Market Line */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.78rem',
          fontWeight: '600',
          color: themeColor,
          marginBottom: '8px',
        }}
      >
        <span>
          {isMarathi ? 'कृषी उत्पन्न बाजार समिती,' : 'APMC,'} {city}
        </span>
        <span>
          {isMarathi ? `(${city} न्यायकक्षेत)` : `(${city} Jurisdiction)`}
        </span>
      </div>

      {/* Large Business Shop Name */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <h1
          style={{
            margin: '0 0 4px 0',
            fontSize: '1.8rem',
            fontWeight: '900',
            color: themeColor,
            letterSpacing: '0.5px',
          }}
        >
          {settings.vendor_name || (isMarathi ? 'बळीराजा व्हेजिटेबल' : 'Baliraja Vegetables')}
        </h1>

        {/* Proprietor names & Phone numbers */}
        <div
          style={{
            fontSize: '0.85rem',
            fontWeight: 'bold',
            color: themeColor,
            marginTop: '2px',
          }}
        >
          {settings.owner_name ? (
            <span>
              {settings.owner_name} - {settings.mobile_number}
            </span>
          ) : (
            <span>
              {isMarathi ? 'भाजीपाला व फळे अडतदार' : 'Vegetables & Fruits Commission Agent'}
            </span>
          )}
        </div>
      </div>

      {/* Meta Line: Receipt No & Address */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.88rem',
          fontWeight: 'bold',
          color: themeColor,
          borderBottom: `1.5px solid ${themeColor}`,
          paddingBottom: '8px',
          marginBottom: '12px',
        }}
      >
        <div>
          <span>{isMarathi ? 'पा. नं.' : 'Bill No.'} </span>
          <span style={{ fontSize: '1.1rem', color: themeColor }}>{bill.bill_number}</span>
        </div>
        <div style={{ fontSize: '0.78rem', maxWidth: '60%', textAlign: 'right' }}>
          {settings.address || (isMarathi ? 'भाजीपाला मार्केट' : 'Vegetable Market')}
        </div>
      </div>

      {/* Customer / village details */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px',
          fontSize: '0.92rem',
          color: '#000',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: themeColor, whiteSpace: 'nowrap' }}>
            {isMarathi ? 'मालधण्याचे नाव :' : 'Customer Name :'}
          </span>
          <span style={{ borderBottom: '1px dotted #555', flex: 1, paddingBottom: '2px' }}>
            {bill.customer_name}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ fontWeight: 'bold', color: themeColor, whiteSpace: 'nowrap' }}>
              {isMarathi ? 'मोबाईल / गाव :' : 'Mobile / Place :'}
            </span>
            <span style={{ borderBottom: '1px dotted #555', flex: 1, paddingBottom: '2px' }}>
              {bill.customer_mobile || '—'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ fontWeight: 'bold', color: themeColor, whiteSpace: 'nowrap' }}>
              {dayGroups
                ? (isMarathi ? 'कालावधी :' : 'Period :')
                : (isMarathi ? 'दिनांक :' : 'Date :')}
            </span>
            <span style={{ borderBottom: '1px dotted #555', paddingBottom: '2px', whiteSpace: 'nowrap' }}>
              {periodLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Mid Grid Items Table */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.9rem',
          border: `1.5px solid ${themeColor}`,
          marginBottom: '14px',
        }}
      >
        <thead>
          <tr style={{ background: isMarathi ? '#fff5f5' : '#f0faf4', borderBottom: `1.5px solid ${themeColor}` }}>
            <th style={{ padding: '8px', borderRight: `1.5px solid ${themeColor}`, fontWeight: 'bold', color: themeColor }}>
              {isMarathi ? 'शेतमालाचे नांव' : 'Vegetable Item'}
            </th>
            <th style={{ padding: '8px', borderRight: `1.5px solid ${themeColor}`, textAlign: 'center', fontWeight: 'bold', color: themeColor, width: '120px' }}>
              {isMarathi ? 'नग/क्रेट/जुडी' : 'Unit Qty'}
            </th>
            <th style={{ padding: '8px', borderRight: `1.5px solid ${themeColor}`, textAlign: 'right', fontWeight: 'bold', color: themeColor, width: '90px' }}>
              {isMarathi ? 'वजन (Weight)' : 'Weight'}
            </th>
            <th style={{ padding: '8px', borderRight: `1.5px solid ${themeColor}`, textAlign: 'right', fontWeight: 'bold', color: themeColor, width: '90px' }}>
              {isMarathi ? 'दर' : 'Rate'}
            </th>
            <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: themeColor, width: '100px' }}>
              {isMarathi ? 'रक्कम' : 'Amount'}
            </th>
          </tr>
        </thead>
        <tbody>
          {dayGroups
            ? dayGroups.map((group, gIdx) => (
                <Fragment key={group.date || `undated-${gIdx}`}>
                  {/* Day header: the vendor's notebook had one of these per page. */}
                  <tr style={{ background: isMarathi ? '#fff5f5' : '#f0faf4' }}>
                    <td
                      colSpan={5}
                      style={{
                        padding: '6px 8px',
                        borderBottom: `1px solid ${themeColor}`,
                        borderTop: cellBorder,
                        fontWeight: 'bold',
                        color: themeColor,
                        fontSize: '0.86rem',
                      }}
                    >
                      {isMarathi ? 'दिनांक' : 'Date'}:{' '}
                      {group.date
                        ? formatBillDate(group.date, isMarathi)
                        : (isMarathi ? 'नोंद नाही' : 'Not recorded')}
                    </td>
                  </tr>

                  {group.items.map((item, idx) => renderItemRow(item, `${gIdx}-${idx}`))}

                  {/* Per-day subtotal, so a customer can check one day without
                      re-adding the whole period. */}
                  <tr style={{ borderBottom: cellBorder }}>
                    <td
                      colSpan={4}
                      style={{
                        padding: '6px 8px',
                        borderRight: cellBorder,
                        textAlign: 'right',
                        fontWeight: 'bold',
                        color: themeColor,
                        fontSize: '0.85rem',
                      }}
                    >
                      {isMarathi ? 'दिवसाची बेरीज' : "Day's Total"}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                      ₹{group.subtotal.toFixed(2)}
                    </td>
                  </tr>
                </Fragment>
              ))
            : displayItems.map((item, idx) => renderItemRow(item, idx))}

          {/* Pad empty rows if list is short, to keep APMC visual look. Only on a
              single-day bill — a period bill is already tall and its day sections
              would be pushed apart by filler. */}
          {!dayGroups && displayItems.length < 4 &&
            Array.from({ length: 4 - displayItems.length }).map((_, idx) => (
              <tr key={`pad-${idx}`} style={{ borderBottom: `1px solid ${themeColor}`, height: '32px' }}>
                <td style={{ borderRight: cellBorder }}>&nbsp;</td>
                <td style={{ borderRight: cellBorder }}>&nbsp;</td>
                <td style={{ borderRight: cellBorder }}>&nbsp;</td>
                <td style={{ borderRight: cellBorder }}>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))
          }
        </tbody>
      </table>

      {/* Bottom Expenses & Calculations Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: '16px',
          fontSize: '0.88rem',
        }}
      >
        {/* Left Side: Expense/Receipt Details Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: `1.5px solid ${themeColor}` }}>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${themeColor}` }}>
              <td style={{ padding: '6px 8px', fontWeight: 'bold', color: themeColor, borderRight: `1px solid ${themeColor}` }}>
                {isMarathi ? 'हमाली / मापाई' : 'Hamali Charges'}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', width: '100px' }}>
                ₹{(Number(bill.hamali_amount) || 0).toFixed(2)}
              </td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${themeColor}` }}>
              <td style={{ padding: '6px 8px', fontWeight: 'bold', color: themeColor, borderRight: `1px solid ${themeColor}` }}>
                {isMarathi ? 'वाहतूक' : 'Transport'}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                ₹{(Number(bill.transport_amount) || 0).toFixed(2)}
              </td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${themeColor}`, background: '#fffbeb' }}>
              <td style={{ padding: '6px 8px', fontWeight: 'bold', color: themeColor, borderRight: `1px solid ${themeColor}` }}>
                {isMarathi ? 'उचल (Paid Amount)' : 'Advance (Paid)'}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: 'var(--color-success)' }}>
                ₹{paidAmount.toFixed(2)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 8px', fontWeight: 'bold', color: themeColor, borderRight: `1px solid ${themeColor}` }}>
                {isMarathi ? 'इतर / सवलत (Discount)' : 'Other (Discount)'}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#dc2626' }}>
                {discountAmount > 0 ? `-₹${discountAmount.toFixed(2)}` : '₹0.00'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Right Side: Calculation Totals Box */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: `1.5px solid ${themeColor}` }}>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${themeColor}` }}>
              <td style={{ padding: '6px 8px', fontWeight: 'bold', color: themeColor, borderRight: `1px solid ${themeColor}` }}>
                {isMarathi ? 'आजचे बिल (Current Bill)' : 'Current Bill Total'}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', width: '105px' }}>
                ₹{finalAmount.toFixed(2)}
              </td>
            </tr>
            {previousBalance > 0 && (
              <tr style={{ borderBottom: `1px solid ${themeColor}`, background: '#fffbeb' }}>
                <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#b45309', borderRight: `1px solid ${themeColor}` }}>
                  {isMarathi ? 'मागील बाकी (Prev. Dues)' : 'Previous Outstanding'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#b45309' }}>
                  ₹{previousBalance.toFixed(2)}
                </td>
              </tr>
            )}
            <tr style={{ borderBottom: `1px solid ${themeColor}`, background: isMarathi ? '#fff5f5' : '#f0faf4' }}>
              <td style={{ padding: '8px', fontWeight: '900', color: themeColor, fontSize: '0.92rem', borderRight: `1px solid ${themeColor}` }}>
                {isMarathi ? 'एकूण देय रू.' : 'Total Payable Rs'}
              </td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: '900', fontSize: '0.95rem', color: themeColor }}>
                ₹{totalPayableAmount.toFixed(2)}
              </td>
            </tr>
            <tr style={{ color: netDueAmount > 0 ? '#dc2626' : 'inherit' }}>
              <td style={{ padding: '6px 8px', fontWeight: 'bold', color: themeColor, borderRight: `1px solid ${themeColor}` }}>
                {isMarathi ? 'उर्वरित बाकी (Net Dues)' : 'Remaining Dues'}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                ₹{netDueAmount.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Amount in words */}
      <div
        style={{
          borderBottom: '1px dotted #555',
          padding: '10px 0 4px 0',
          fontSize: '0.88rem',
          display: 'flex',
          gap: '8px',
        }}
      >
        <span style={{ fontWeight: 'bold', color: themeColor }}>
          {isMarathi ? 'अक्षरी रू. :' : 'Amount in Words :'}
        </span>
        <span style={{ fontStyle: 'italic' }}>
          {getAmountInWords(totalPayableAmount, isMarathi)}
        </span>
      </div>

      {/* Signatures & Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '25px',
          fontSize: '0.8rem',
          fontWeight: 'bold',
          color: themeColor,
        }}
      >
        <div style={{ textAlign: 'center', width: '160px' }}>
          <div style={{ borderBottom: '1.5px dotted #555', height: '24px', marginBottom: '4px' }} />
          <span>{isMarathi ? 'ग्राहकाची सही' : 'Customer Signature'}</span>
        </div>

        <div style={{ textAlign: 'center', width: '160px' }}>
          <div style={{ borderBottom: '1.5px dotted #555', height: '24px', marginBottom: '4px' }} />
          <span>{isMarathi ? 'अधिकृत सही (अडतदार)' : 'Authorized Signature'}</span>
        </div>
      </div>

      <div
        style={{
          textAlign: 'center',
          marginTop: '25px',
          fontSize: '0.78rem',
          color: '#666',
          fontStyle: 'italic',
        }}
      >
        {t('billing.thankYou')}
      </div>
    </div>
  );
}
