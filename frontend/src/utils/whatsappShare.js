/**
 * WhatsApp Share Utility
 * Handles mobile number formatting, multilingual template formatting,
 * and wa.me link generation.
 */

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
 * @param {object} bill 
 * @param {string} language ('en' or 'mr')
 * @param {function} t translation function
 * @returns {string} Fully formatted text
 */
export function generateBillWhatsAppMessage(bill, language, t) {
  if (!bill) return '';
  const customerName = bill.customer_name || '';
  const billNumber   = bill.bill_number || '';
  const billDate     = new Date(bill.date).toLocaleDateString('en-IN');
  
  const subtotal         = Number(bill.subtotal || 0).toFixed(2);
  const discountAmount   = Number(bill.discount_amount || 0).toFixed(2);
  const discountValue    = Number(bill.discount_value || 0);
  const discountType     = bill.discount_type || 'fixed';
  const commissionAmount = Number(bill.commission_amount || 0).toFixed(2);
  const finalAmount      = Number(bill.final_amount || 0).toFixed(2);
  const paidAmount       = Number(bill.paid_amount || 0).toFixed(2);
  const remainingAmount  = Number(bill.remaining_amount || 0).toFixed(2);
  const statusKey        = `billing.status${bill.payment_status}`;
  const statusTranslated = t(statusKey) || bill.payment_status;

  const itemsListText = (bill.items || []).map((item, idx) => {
    const vegName = item.vegetable_name || '';
    const qty     = item.quantity;
    const rate    = Number(item.rate).toFixed(2);
    const total   = Number(item.total).toFixed(2);
    const unit    = item.vegetable_unit ? t(`vegetables.units.${item.vegetable_unit}`) : '';
    return `${idx + 1}. ${vegName} - ${qty} ${unit} x ₹${rate} = ₹${total}`;
  }).join('\n');

  if (language === 'mr') {
    const discountText = Number(discountAmount) > 0
      ? `सवलत ${discountType === 'percentage' ? `(${discountValue}%)` : '(Fixed)'}: -₹${discountAmount}\n`
      : '';

    return `नमस्कार ${customerName},
आपले बिल तयार झाले आहे.

बिल क्रमांक: ${billNumber}
दिनांक: ${billDate}

भाज्या:
${itemsListText}

एकूण: ₹${subtotal}
${discountText}कमिशन (८%): +₹${commissionAmount}
अंतिम रक्कम: ₹${finalAmount}
भरलेली रक्कम: ₹${paidAmount}
बाकी रक्कम: ₹${remainingAmount}
पेमेंट स्थिती: ${statusTranslated}

धन्यवाद.`;
  } else {
    // English
    const discountText = Number(discountAmount) > 0
      ? `Discount ${discountType === 'percentage' ? `(${discountValue}%)` : '(Fixed)'}: -₹${discountAmount}\n`
      : '';

    return `Hello ${customerName},
Your bill has been generated.

Bill No: ${billNumber}
Date: ${billDate}

Items:
${itemsListText}

Subtotal: ₹${subtotal}
${discountText}Commission (8%): +₹${commissionAmount}
Final Amount: ₹${finalAmount}
Paid Amount: ₹${paidAmount}
Remaining Amount: ₹${remainingAmount}
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
