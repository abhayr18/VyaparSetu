/**
 * WhatsApp Share Utility
 * Handles mobile number formatting, multilingual template formatting,
 * and wa.me link generation.
 */

import {
  grossItems,
  grossSubtotal,
  groupItemsByDate,
  formatBillDate,
  formatBillPeriod,
} from './billDisplay';

/**
 * Format mobile number to India standard (91 prefix)
 * @param {string} mobile
 * @returns {string|null} Formatted mobile or null if invalid
 */
export function formatIndianMobileNumber(mobile) {
  if (!mobile) return null;
  // Strip all non-numeric characters
  const clean = mobile.replace(/\D/g, '');
  if (clean.length === 10) {
    return '91' + clean;
  }
  if (clean.length === 12 && clean.startsWith('91')) {
    return clean;
  }
  return null;
}

/**
 * Generate invoice message text in English or Marathi
 *
 * Commission is folded into the item rates and never listed — the same transform the
 * printed bill applies, so a customer who compares the two sees the same figures.
 * (The old version printed a hardcoded "8%" against whatever the bill actually
 * charged, which was wrong for every bill written at any other rate.)
 *
 * @param {object} bill
 * @param {string} language ('en' or 'mr')
 * @param {function} t translation function
 * @returns {string} Fully formatted text
 */
export function generateBillWhatsAppMessage(bill, language, t) {
  if (!bill) return '';
  const isMarathi = language === 'mr';
  const customerName = bill.customer_name || '';
  const billNumber   = bill.bill_number || '';
  const periodLabel  = formatBillPeriod(bill, isMarathi);

  const subtotal         = grossSubtotal(bill).toFixed(2);
  const discountAmount   = Number(bill.discount_amount || 0).toFixed(2);
  const discountValue    = Number(bill.discount_value || 0);
  const discountType     = bill.discount_type || 'fixed';
  const finalAmountNum   = Number(bill.final_amount || 0);
  const paidAmountNum    = Number(bill.paid_amount || 0);
  const remainingAmountNum = Number(bill.remaining_amount || 0);

  const customerBalance  = Number(bill.customer_credit_balance || 0);
  const previousBalanceNum = Math.max(0, Math.round((customerBalance - remainingAmountNum) * 100) / 100);
  const totalPayableNum  = Math.round((finalAmountNum + previousBalanceNum) * 100) / 100;
  const netDueNum        = Math.round((previousBalanceNum + remainingAmountNum) * 100) / 100;

  const finalAmount      = finalAmountNum.toFixed(2);
  const previousBalance  = previousBalanceNum.toFixed(2);
  const totalPayable     = totalPayableNum.toFixed(2);
  const paidAmount       = paidAmountNum.toFixed(2);
  const netRemaining     = netDueNum.toFixed(2);

  const statusKey        = `billing.status${bill.payment_status}`;
  const statusTranslated = t(statusKey) || bill.payment_status;

  const displayItems = grossItems(bill.items, bill);

  function lineFor(item, idx) {
    const vegName = item.vegetable_name || '';
    const qty     = item.quantity;
    const rate    = Number(item.rate).toFixed(2);
    const total   = Number(item.total).toFixed(2);
    const unit    = item.vegetable_unit ? t(`vegetables.units.${item.vegetable_unit}`) : '';
    return `${idx}. ${vegName} - ${qty} ${unit} x ₹${rate} = ₹${total}`;
  }

  // Always group items datewise so each day's purchases are shown with date header and subtotal
  const dayGroups = groupItemsByDate(displayItems, bill.date);

  let itemsListText;
  if (dayGroups) {
    let lineNo = 0;
    itemsListText = dayGroups
      .map((group) => {
        const heading = group.date
          ? formatBillDate(group.date, isMarathi)
          : (isMarathi ? 'नोंद नाही' : 'Not recorded');
        const lines = group.items.map((item) => lineFor(item, (lineNo += 1))).join('\n');
        const dayTotal = isMarathi ? 'दिवसाची बेरीज' : "Day's Total";
        return `📅 ${heading}\n${lines}\n${dayTotal}: ₹${group.subtotal.toFixed(2)}`;
      })
      .join('\n\n');
  } else {
    itemsListText = displayItems.map((item, idx) => lineFor(item, idx + 1)).join('\n');
  }

  const dateLabel = isMarathi
    ? (dayGroups ? 'कालावधी' : 'दिनांक')
    : (dayGroups ? 'Period' : 'Date');

  if (isMarathi) {
    const discountText = Number(discountAmount) > 0
      ? `सवलत ${discountType === 'percentage' ? `(${discountValue}%)` : '(Fixed)'}: -₹${discountAmount}\n`
      : '';
    const prevDuesText = previousBalanceNum > 0
      ? `मागील बाकी: ₹${previousBalance}\n`
      : '';
    const billNoText = billNumber
      ? `बिल क्रमांक: ${billNumber}\n`
      : `दस्तऐवज: खाते उतारा (Statement)\n`;

    return `नमस्कार ${customerName},
आपला तपशील खालीलप्रमाणे आहे:

${billNoText}${dateLabel}: ${periodLabel}

भाज्या:
${itemsListText}

एकूण: ₹${subtotal}
${discountText}कालावधी / आजचे बिल: ₹${finalAmount}
${prevDuesText}एकूण देय रक्कम: ₹${totalPayable}
भरलेली रक्कम: ₹${paidAmount}
एकूण शिल्लक बाकी: ₹${netRemaining}
पेमेंट स्थिती: ${statusTranslated}

धन्यवाद.`;
  } else {
    // English
    const discountText = Number(discountAmount) > 0
      ? `Discount ${discountType === 'percentage' ? `(${discountValue}%)` : '(Fixed)'}: -₹${discountAmount}\n`
      : '';
    const prevDuesText = previousBalanceNum > 0
      ? `Previous Outstanding: ₹${previousBalance}\n`
      : '';
    const billNoText = billNumber
      ? `Bill No: ${billNumber}\n`
      : `Document: Customer Statement\n`;

    return `Hello ${customerName},
Here is your summary:

${billNoText}${dateLabel}: ${periodLabel}

Vegetables:
${itemsListText}

Subtotal: ₹${subtotal}
${discountText}Period / Today Bill: ₹${finalAmount}
${prevDuesText}Total Payable: ₹${totalPayable}
Amount Paid: ₹${paidAmount}
Total Remaining Dues: ₹${netRemaining}
Payment Status: ${statusTranslated}

Thank you.`;
  }
}

/**
 * Generate URL to share via wa.me browser link
 * @param {string} mobile 
 * @param {string} message 
 * @returns {string|null} Encoded URL or null if mobile is invalid
 */
export function createWhatsAppShareUrl(mobile, message) {
  const formattedMobile = formatIndianMobileNumber(mobile);
  if (!formattedMobile) return null;
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${formattedMobile}?text=${encodedText}`;
}
