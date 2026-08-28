/**
 * Excel Import / Export Utilities for VyapaarSetu
 * Handles .xlsx, .xls, .csv generation and parsing with Marathi & English support.
 */

import * as XLSX from 'xlsx';

// ─── Header Normalizer ────────────────────────────────────────────────────────
function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[\s_\-()[\]/\\:]+/g, '')
    .trim();
}

const VEG_HEADER_MAP = {
  name: [
    'name',
    'vegetablename',
    'item',
    'itemname',
    'भाजीचेनाव',
    'भाजीनाव',
    'भाजी',
    'नाव',
  ],
  rate: [
    'rate',
    'price',
    'rateperunit',
    'दर',
    'भाव',
    'किंमत',
  ],
  unit: [
    'unit',
    'एकक',
    'माप',
  ],
  search_keywords: [
    'searchkeywords',
    'keywords',
    'aliases',
    'शोधकीवर्ड',
    'पर्यायीनावे',
    'कीवर्ड',
  ],
  notes: [
    'notes',
    'note',
    'remark',
    'टिप्पणी',
    'माहिती',
  ],
};

const CUSTOMER_HEADER_MAP = {
  name: [
    'name',
    'customername',
    'party',
    'partyname',
    'ग्राहकाचेनाव',
    'ग्राहकनाव',
    'ग्राहक',
    'नाव',
  ],
  mobile: [
    'mobile',
    'mobilenumber',
    'phone',
    'phonenumber',
    'contact',
    'मोबाईल',
    'मोबाईलक्रमांक',
    'फोन',
    'संपर्क',
  ],
  address: [
    'address',
    'city',
    'village',
    'पत्ता',
    'गाव',
    'ठिकाण',
  ],
  notes: [
    'notes',
    'note',
    'remark',
    'टिप्पणी',
    'माहिती',
  ],
  opening_balance: [
    'openingbalance',
    'balance',
    'credit',
    'udhar',
    'आरंभीचीशिल्लक',
    'उधारी',
    'उधारीशिल्लक',
    'शिल्लक',
  ],
};

function matchField(rawHeader, headerMap) {
  const norm = normalizeKey(rawHeader);
  for (const [field, aliases] of Object.entries(headerMap)) {
    if (aliases.some((alias) => norm === normalizeKey(alias))) {
      return field;
    }
  }
  return null;
}

// ─── Export Functions ─────────────────────────────────────────────────────────

/**
 * Export vegetables array to an Excel (.xlsx) file.
 * @param {Array} vegetables
 * @param {string} [filename]
 */
export function exportVegetablesToExcel(vegetables, filename) {
  const defaultFilename = `VyapaarSetu_Vegetables_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const nameToUse = filename || defaultFilename;

  const rows = [
    [
      'भाजीचे नाव (Name)',
      'दर / Rate (₹)',
      'एकक / Unit',
      'शोध कीवर्ड (Search Keywords)',
      'टिप्पणी / Notes',
    ],
  ];

  vegetables.forEach((v) => {
    rows.push([
      v.name || '',
      Number(v.rate || 0),
      v.unit || 'kg',
      v.search_keywords || '',
      v.notes || '',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 24 }, // Name
    { wch: 14 }, // Rate
    { wch: 12 }, // Unit
    { wch: 30 }, // Search Keywords
    { wch: 24 }, // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vegetables');
  XLSX.writeFile(wb, nameToUse);
}

/**
 * Export customers array to an Excel (.xlsx) file.
 * @param {Array} customers
 * @param {string} [filename]
 */
export function exportCustomersToExcel(customers, filename) {
  const defaultFilename = `VyapaarSetu_Customers_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const nameToUse = filename || defaultFilename;

  const rows = [
    [
      'ग्राहकाचे नाव (Customer Name)',
      'मोबाईल (Mobile Number)',
      'उधारी शिल्लक / Credit (₹)',
      'पत्ता (Address)',
      'टिप्पणी (Notes)',
      'नोंदणी तारीख (Registered Date)',
    ],
  ];

  customers.forEach((c) => {
    rows.push([
      c.name || '',
      c.mobile || '',
      Number(c.credit_balance || 0),
      c.address || '',
      c.notes || '',
      c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 26 }, // Name
    { wch: 16 }, // Mobile
    { wch: 18 }, // Credit Balance
    { wch: 26 }, // Address
    { wch: 22 }, // Notes
    { wch: 18 }, // Registered Date
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  XLSX.writeFile(wb, nameToUse);
}

/**
 * Generate sample Excel template for Vegetables.
 */
export function generateVegetablesSampleTemplate() {
  const rows = [
    [
      'भाजीचे नाव (Name)',
      'दर / Rate (₹)',
      'एकक / Unit',
      'शोध कीवर्ड (Search Keywords)',
      'टिप्पणी / Notes',
    ],
    ['टोमॅटो', 40, 'kg', 'tomato, tamatar, laal', 'ताजा लाल माल'],
    ['बटाटा', 30, 'kg', 'potato, batata, aloo', 'नवीन बटाटा'],
    ['कांदा', 25, 'kg', 'onion, kanda, pyaj', 'गावरान कांदा'],
    ['कोथिंबीर', 10, 'bundle', 'coriander, kothimbir', 'जुडी'],
    ['शेवगा शेंग', 80, 'kg', 'shevga, drumstick', ''],
    ['आले', 120, 'kg', 'ginger, aale, adrak', ''],
    ['लसूण', 180, 'kg', 'garlic, lasun, lahsun', ''],
    ['हिरवी मिरची', 60, 'kg', 'chilli, mirchi, green chilli', 'तिखट लवंगी'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 32 },
    { wch: 22 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vegetables_Template');
  XLSX.writeFile(wb, 'VyapaarSetu_Vegetables_Template.xlsx');
}

/**
 * Generate sample Excel template for Customers.
 */
export function generateCustomersSampleTemplate() {
  const rows = [
    [
      'ग्राहकाचे नाव (Customer Name)',
      'मोबाईल (Mobile Number - 10 Digits)',
      'पत्ता (Address)',
      'आरंभीची उधारी (Opening Balance ₹)',
      'टिप्पणी (Notes)',
    ],
    ['रमेश पाटील', '9876543210', 'हॉटेल निसर्ग, मेन रोड', 1500, 'नियमित हॉटेल ग्राहक'],
    ['सुरेश जाधव', '9876543211', 'मार्केट यार्ड, पुणे', 0, 'रोख व उधारी'],
    ['गणेश शिंदे', '9876543212', 'कोथरूड', 500, ''],
    ['आनंद हॉटेल', '9876543213', 'शिवाजी चौक', 2400, 'आठवड्यातून एकदा हिशोब'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 26 },
    { wch: 28 },
    { wch: 26 },
    { wch: 26 },
    { wch: 24 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers_Template');
  XLSX.writeFile(wb, 'VyapaarSetu_Customers_Template.xlsx');
}

// ─── Import / Parsing Functions ───────────────────────────────────────────────

/**
 * Read File object as ArrayBuffer.
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse an uploaded Excel/CSV file into vegetable records with row-by-row validation.
 * @param {File} file
 * @param {Array} existingVegetables
 * @returns {Promise<{ items: Array, summary: { total: number, valid: number, invalid: number, duplicates: number } }>}
 */
export async function parseVegetablesExcelFile(file, existingVegetables = []) {
  const buffer = await readFileAsArrayBuffer(file);
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel file has no worksheets.');
  }

  const sheet = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rawData.length < 2) {
    throw new Error('Excel sheet is empty or only contains headers.');
  }

  const headers = rawData[0];
  const fieldMapping = {};

  headers.forEach((h, colIndex) => {
    const matched = matchField(h, VEG_HEADER_MAP);
    if (matched && fieldMapping[matched] === undefined) {
      fieldMapping[matched] = colIndex;
    }
  });

  // Fallback defaults if columns not matched by header names
  if (fieldMapping.name === undefined) fieldMapping.name = 0;
  if (fieldMapping.rate === undefined) fieldMapping.rate = 1;
  if (fieldMapping.unit === undefined) fieldMapping.unit = 2;
  if (fieldMapping.search_keywords === undefined) fieldMapping.search_keywords = 3;
  if (fieldMapping.notes === undefined) fieldMapping.notes = 4;

  const existingNamesMap = new Set(
    existingVegetables.map((v) => (v.name || '').trim().toLowerCase())
  );

  const items = [];
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    // Skip completely empty rows
    if (!row || row.every((cell) => String(cell).trim() === '')) {
      continue;
    }

    const rawName = String(row[fieldMapping.name] ?? '').trim();
    const rawRate = row[fieldMapping.rate];
    const rawUnit = String(row[fieldMapping.unit] ?? '').trim();
    const rawKeywords = String(row[fieldMapping.search_keywords] ?? '').trim();
    const rawNotes = String(row[fieldMapping.notes] ?? '').trim();

    const rowErrors = [];

    if (!rawName) {
      rowErrors.push('Vegetable name is required');
    }

    const rateNum = parseFloat(rawRate);
    if (rawRate === undefined || rawRate === null || rawRate === '' || isNaN(rateNum) || rateNum < 0) {
      rowErrors.push('Valid rate (₹ 0 or more) is required');
    }

    const isExisting = rawName ? existingNamesMap.has(rawName.toLowerCase()) : false;
    if (isExisting) duplicateCount++;

    const isValid = rowErrors.length === 0;
    if (isValid) validCount++;
    else invalidCount++;

    items.push({
      rowIndex: i + 1,
      name: rawName,
      rate: isNaN(rateNum) ? 0 : rateNum,
      unit: rawUnit || 'kg',
      search_keywords: rawKeywords,
      notes: rawNotes,
      isValid,
      isExisting,
      errors: rowErrors,
    });
  }

  return {
    items,
    summary: {
      total: items.length,
      valid: validCount,
      invalid: invalidCount,
      duplicates: duplicateCount,
    },
  };
}

/**
 * Parse an uploaded Excel/CSV file into customer records with row-by-row validation.
 * @param {File} file
 * @param {Array} existingCustomers
 * @returns {Promise<{ items: Array, summary: { total: number, valid: number, invalid: number, duplicates: number } }>}
 */
export async function parseCustomersExcelFile(file, existingCustomers = []) {
  const buffer = await readFileAsArrayBuffer(file);
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel file has no worksheets.');
  }

  const sheet = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rawData.length < 2) {
    throw new Error('Excel sheet is empty or only contains headers.');
  }

  const headers = rawData[0];
  const fieldMapping = {};

  headers.forEach((h, colIndex) => {
    const matched = matchField(h, CUSTOMER_HEADER_MAP);
    if (matched && fieldMapping[matched] === undefined) {
      fieldMapping[matched] = colIndex;
    }
  });

  if (fieldMapping.name === undefined) fieldMapping.name = 0;
  if (fieldMapping.mobile === undefined) fieldMapping.mobile = 1;
  if (fieldMapping.address === undefined) fieldMapping.address = 2;
  if (fieldMapping.opening_balance === undefined) fieldMapping.opening_balance = 3;
  if (fieldMapping.notes === undefined) fieldMapping.notes = 4;

  const existingMobilesMap = new Set(
    existingCustomers.map((c) => String(c.mobile || '').trim())
  );

  const items = [];
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.every((cell) => String(cell).trim() === '')) {
      continue;
    }

    const rawName = String(row[fieldMapping.name] ?? '').trim();
    // Clean mobile number (remove spaces, dashes, +91 if present)
    let rawMobile = String(row[fieldMapping.mobile] ?? '').replace(/\D/g, '');
    if (rawMobile.length === 12 && rawMobile.startsWith('91')) {
      rawMobile = rawMobile.slice(2);
    }
    const rawAddress = String(row[fieldMapping.address] ?? '').trim();
    const rawNotes = String(row[fieldMapping.notes] ?? '').trim();
    const rawOpening = row[fieldMapping.opening_balance];

    const rowErrors = [];

    if (!rawName) {
      rowErrors.push('Customer name is required');
    }

    if (!rawMobile) {
      rowErrors.push('Mobile number is required');
    } else if (!/^\d{10}$/.test(rawMobile)) {
      rowErrors.push('Mobile must be 10 digits');
    }

    let openingBalance = 0;
    if (rawOpening !== undefined && rawOpening !== null && String(rawOpening).trim() !== '') {
      const parsed = parseFloat(rawOpening);
      if (isNaN(parsed) || parsed < 0) {
        rowErrors.push('Opening balance must be 0 or more');
      } else {
        openingBalance = parsed;
      }
    }

    const isExisting = rawMobile ? existingMobilesMap.has(rawMobile) : false;
    if (isExisting) duplicateCount++;

    const isValid = rowErrors.length === 0;
    if (isValid) validCount++;
    else invalidCount++;

    items.push({
      rowIndex: i + 1,
      name: rawName,
      mobile: rawMobile,
      address: rawAddress,
      notes: rawNotes,
      opening_balance: openingBalance,
      isValid,
      isExisting,
      errors: rowErrors,
    });
  }

  return {
    items,
    summary: {
      total: items.length,
      valid: validCount,
      invalid: invalidCount,
      duplicates: duplicateCount,
    },
  };
}

/**
 * Export All-In-One Master Business Record to a comprehensive multi-tab Excel Workbook (.xlsx)
 * @param {Object} reportData Data from /api/reports/all-in-one
 * @param {string} [filename]
 */
export function exportAllInOneReportToExcel(reportData, filename) {
  if (!reportData) return;

  const shop = reportData.shop || {};
  const summary = reportData.summary || {};
  const bills = reportData.bills || [];
  const customers = reportData.customers || [];
  const creditLedger = reportData.credit_ledger || [];
  const vegSales = reportData.vegetable_sales || [];
  const vegCatalog = reportData.vegetable_catalog || [];
  const meta = reportData.meta || {};

  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultFilename = `VyapaarSetu_Master_Business_Report_${meta.start_date || 'AllTime'}_to_${meta.end_date || todayStr}.xlsx`;
  const nameToUse = filename || defaultFilename;

  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: 📊 Executive Summary ──────────────────────────────────────────
  const summaryRows = [
    ['=== VYAPAARSETU BUSINESS MASTER RECORD / व्यापारी अहवाल ==='],
    ['दुकान / व्यवसाय (Shop Name)', shop.vendor_name || 'VyapaarSetu Store'],
    ['टॅगलाइन (Tagline)', shop.tagline || 'भाजीपाला व फळे अडतदार'],
    ['मालक (Owner / Proprietor)', shop.owner_name || ''],
    ['मोबाईल क्रमांक (Mobile)', shop.mobile_number || ''],
    ['दुसरा मोबाईल / WhatsApp', shop.secondary_mobile || ''],
    ['मार्केट / बाजार समिती', shop.market_name || ''],
    ['गाळा नं. (Gala No)', shop.gala_number || ''],
    ['पत्ता (Address)', `${shop.address || ''} ${shop.city || ''}`.trim()],
    ['अहवाल कालावधी (Period)', meta.period_label || 'All-Time'],
    ['अहवाल तयार तारीख (Generated Date)', new Date().toLocaleString('en-IN')],
    [],
    ['=== मुख्य आर्थिक व व्यापार निर्देशक (KEY FINANCIAL KPIS) ===', ''],
    ['एकूण बिले संख्या (Total Invoices Count)', Number(summary.total_bills || 0)],
    ['एकूण विक्री रक्कम / ग्रॉस (Total Gross Sales ₹)', Number(summary.total_subtotal || 0)],
    ['एकूण सूट (Total Discount Given ₹)', Number(summary.total_discount || 0)],
    ['एकूण निव्वळ विक्री (Total Net Sales ₹)', Number(summary.total_sales || 0)],
    ['एकूण जमा रक्कम (Total Amount Collected ₹)', Number(summary.total_paid || 0)],
    ['  - रोख जमा (Cash Collection ₹)', Number(summary.cash_collection || 0)],
    ['  - UPI जमा (UPI Collection ₹)', Number(summary.upi_collection || 0)],
    ['कालावधीतील उधारी विक्री (Period Credit Sales ₹)', Number(summary.credit_sales || 0)],
    ['एकूण चालू उधारी शिल्लक (Total Outstanding Dues ₹)', Number(summary.total_credit_outstanding || 0)],
    ['एकूण कमिशन उत्पन्न (Total Commission Earned ₹)', Number(summary.total_commission || 0)],
    ['एकूण हमाली खर्च (Total Hamali ₹)', Number(summary.total_hamali || 0)],
    ['एकूण गाडीभाडे (Total Transport ₹)', Number(summary.total_transport || 0)],
    ['एकूण नोंदणीकृत ग्राहक (Active Customers Count)', Number(summary.total_customers_count || customers.length)],
    ['भाजीपाला कॅटलॉग वस्तू (Vegetable Catalog Items)', Number(summary.total_vegetables_count || vegCatalog.length)],
    ['विक्री झालेले एकूण प्रमाण (Total Volume Sold)', Number(summary.total_vegetables_volume || 0)],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 48 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  // ─── Sheet 2: 🧾 Bills & Invoices ───────────────────────────────────────────
  const billRows = [
    [
      'बिल नं. (Bill No)',
      'दिनांक (Date)',
      'ग्राहकाचे नाव (Customer Name)',
      'मोबाईल (Mobile)',
      'पत्ता (Address)',
      'वस्तू तपशील (Items Summary)',
      'वस्तू संख्या (Item Count)',
      'उप-एकूण / Subtotal (₹)',
      'सूट / Discount (₹)',
      'कमिशन / Commission (₹)',
      'हमाली / Hamali (₹)',
      'गाडीभाडे / Transport (₹)',
      'एकूण रक्कम / Grand Total (₹)',
      'भरलेली रक्कम / Paid (₹)',
      'उधारी शिल्लक / Remaining (₹)',
      'स्थिती / Payment Status',
      'पेमेंट प्रकार / Mode',
    ],
  ];

  bills.forEach((b) => {
    billRows.push([
      b.bill_number || `BILL-#${b.id}`,
      b.date ? new Date(b.date).toLocaleDateString('en-IN') : '',
      b.customer_name || '',
      b.customer_mobile || '',
      b.customer_address || '',
      b.items_summary || (b.items ? b.items.map((i) => `${i.vegetable_name} (${i.quantity} ${i.vegetable_unit || 'kg'} @ ₹${i.rate})`).join(', ') : ''),
      b.items ? b.items.length : 0,
      Number(b.subtotal || 0),
      Number(b.discount_amount || 0),
      Number(b.commission_amount || 0),
      Number(b.hamali_amount || 0),
      Number(b.transport_amount || 0),
      Number(b.final_amount || 0),
      Number(b.paid_amount || 0),
      Number(b.remaining_amount || 0),
      b.payment_status || 'Paid',
      b.payment_type || 'Cash',
    ]);
  });

  const wsBills = XLSX.utils.aoa_to_sheet(billRows);
  wsBills['!cols'] = [
    { wch: 18 }, // Bill No
    { wch: 14 }, // Date
    { wch: 24 }, // Customer Name
    { wch: 15 }, // Mobile
    { wch: 22 }, // Address
    { wch: 45 }, // Items Summary
    { wch: 12 }, // Item Count
    { wch: 16 }, // Subtotal
    { wch: 14 }, // Discount
    { wch: 16 }, // Commission
    { wch: 14 }, // Hamali
    { wch: 14 }, // Transport
    { wch: 18 }, // Grand Total
    { wch: 16 }, // Paid
    { wch: 16 }, // Remaining
    { wch: 16 }, // Status
    { wch: 14 }, // Mode
  ];
  XLSX.utils.book_append_sheet(wb, wsBills, 'Invoices & Bills');

  // ─── Sheet 3: 👥 Customers & Credit ─────────────────────────────────────────
  const customerRows = [
    [
      'ग्राहक क्रमांक (Customer ID)',
      'ग्राहकाचे नाव (Customer Name)',
      'मोबाईल नंबर (Mobile Number)',
      'पत्ता (Address / Village)',
      'कालावधीतील बिले (Invoices Count)',
      'एकूण खरेदी / Total Purchases (₹)',
      'एकूण जमा / Total Paid (₹)',
      'चालू उधारी शिल्लक / Outstanding Dues (₹)',
      'नोंदणी दिनांक (Registered Date)',
      'टिप्पणी (Notes)',
    ],
  ];

  customers.forEach((c) => {
    customerRows.push([
      `CUST-#${c.id}`,
      c.name || '',
      c.mobile || '',
      c.address || '',
      Number(c.total_bills || 0),
      Number(c.total_purchases || 0),
      Number(c.total_paid || 0),
      Number(c.current_credit_balance || 0),
      c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '',
      c.notes || '',
    ]);
  });

  const wsCustomers = XLSX.utils.aoa_to_sheet(customerRows);
  wsCustomers['!cols'] = [
    { wch: 16 },
    { wch: 26 },
    { wch: 16 },
    { wch: 26 },
    { wch: 16 },
    { wch: 20 },
    { wch: 18 },
    { wch: 24 },
    { wch: 16 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCustomers, 'Customer Ledger');

  // ─── Sheet 4: 💰 Payment & Credit Ledger ────────────────────────────────────
  const ledgerRows = [
    [
      'नोंद क्रमांक (Txn ID)',
      'तारीख व वेळ (Date & Time)',
      'ग्राहकाचे नाव (Customer Name)',
      'मोबाईल (Mobile)',
      'व्यवहार प्रकार (Type)',
      'रक्कम / Amount (₹)',
      'पेमेंट मार्ग (Payment Mode)',
      'व्यवहारानंतर शिल्लक / Balance After (₹)',
      'संबंधित बिल नं. (Bill Ref)',
      'टिप्पणी / Note',
    ],
  ];

  creditLedger.forEach((r) => {
    ledgerRows.push([
      `TXN-#${r.id}`,
      r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '',
      r.customer_name || '',
      r.customer_mobile || '',
      r.transaction_type === 'PAYMENT_RECEIVED'
        ? 'जमा / Payment Received'
        : r.transaction_type === 'CREDIT_ADDED'
        ? 'उधारी / Credit Given'
        : r.transaction_type === 'OPENING_BALANCE'
        ? 'आरंभीची उधारी / Opening Balance'
        : r.transaction_type,
      Number(r.amount || 0),
      r.payment_mode || 'Cash',
      Number(r.balance_after_transaction || 0),
      r.bill_number || (r.bill_id ? `BILL-#${r.bill_id}` : ''),
      r.note || '',
    ]);
  });

  const wsLedger = XLSX.utils.aoa_to_sheet(ledgerRows);
  wsLedger['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 24 },
    { wch: 16 },
    { wch: 24 },
    { wch: 16 },
    { wch: 16 },
    { wch: 22 },
    { wch: 18 },
    { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLedger, 'Passbook & Payments');

  // ─── Sheet 5: 🥕 Vegetable Sales Breakdown ──────────────────────────────────
  const vegSalesRows = [
    [
      'भाजीचे नाव (Vegetable Name)',
      'एकक / Unit',
      'विक्री प्रमाण / Total Volume Sold',
      'एकूण महसूल / Total Revenue (₹)',
      'बिलांची संख्या / Invoices Count',
      'सरासरी दर / Average Rate (₹)',
    ],
  ];

  vegSales.forEach((v) => {
    vegSalesRows.push([
      v.vegetable_name || '',
      v.vegetable_unit || 'kg',
      Number(v.total_quantity || 0),
      Number(v.total_sales || 0),
      Number(v.total_bills || 0),
      Number(v.average_rate || (v.total_quantity > 0 ? (v.total_sales / v.total_quantity).toFixed(2) : 0)),
    ]);
  });

  const wsVegSales = XLSX.utils.aoa_to_sheet(vegSalesRows);
  wsVegSales['!cols'] = [
    { wch: 26 },
    { wch: 12 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsVegSales, 'Vegetable Sales');

  // ─── Sheet 6: 🥬 Vegetables Catalog ─────────────────────────────────────────
  const catalogRows = [
    [
      'क्रमांक (ID)',
      'भाजीचे नाव (Vegetable Name)',
      'चालू दर / Current Rate (₹)',
      'एकक / Unit',
      'शोध कीवर्ड (Search Keywords)',
      'टिप्पणी (Notes)',
    ],
  ];

  vegCatalog.forEach((v) => {
    catalogRows.push([
      `VEG-#${v.id}`,
      v.name || '',
      Number(v.rate || 0),
      v.unit || 'kg',
      v.search_keywords || '',
      v.notes || '',
    ]);
  });

  const wsCatalog = XLSX.utils.aoa_to_sheet(catalogRows);
  wsCatalog['!cols'] = [
    { wch: 12 },
    { wch: 26 },
    { wch: 16 },
    { wch: 12 },
    { wch: 32 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCatalog, 'Price Catalog');

  // Write and download Excel workbook
  XLSX.writeFile(wb, nameToUse);
}
