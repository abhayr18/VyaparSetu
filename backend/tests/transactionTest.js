/**
 * Transaction Module Backend Verification Test
 */

const { initializeDatabase } = require('../database/init');
const { calculateTransactionTotals } = require('../utils/calculation');
const customerModel = require('../models/customerModel');
const vegetableModel = require('../models/vegetableModel');
const transactionService = require('../services/transactionService');

async function runTests() {
  console.log('=== Starting Transaction Module Tests ===');

  // 1. Initialize DB
  await initializeDatabase();
  console.log('✔ DB initialized successfully');

  // 2. Test Calculation logic
  // Example: Weight = 10, Rate = 30 => Base = 300, Comm = 24, Final = 324
  const totals1 = calculateTransactionTotals(10, 30, 0.08);
  console.assert(totals1.baseAmount === 300, `Expected 300, got ${totals1.baseAmount}`);
  console.assert(totals1.commissionAmount === 24, `Expected 24, got ${totals1.commissionAmount}`);
  console.assert(totals1.finalAmount === 324, `Expected 324, got ${totals1.finalAmount}`);
  console.log('✔ Calculation totals test passed (10kg @ ₹30 = ₹300 + ₹24 comm = ₹324)');

  // Example: Weight = 5, Rate = 25 => Base = 125, Comm = 10, Final = 135
  const totals2 = calculateTransactionTotals(5, 25, 0.08);
  console.assert(totals2.baseAmount === 125, `Expected 125, got ${totals2.baseAmount}`);
  console.assert(totals2.commissionAmount === 10, `Expected 10, got ${totals2.commissionAmount}`);
  console.assert(totals2.finalAmount === 135, `Expected 135, got ${totals2.finalAmount}`);
  console.log('✔ Calculation totals test passed (5kg @ ₹25 = ₹125 + ₹10 comm = ₹135)');

  // Example: Weight = 8, Rate = 40 => Base = 320, Comm = 25.6, Final = 345.6
  const totals3 = calculateTransactionTotals(8, 40, 0.08);
  console.assert(totals3.baseAmount === 320, `Expected 320, got ${totals3.baseAmount}`);
  console.assert(totals3.commissionAmount === 25.6, `Expected 25.6, got ${totals3.commissionAmount}`);
  console.assert(totals3.finalAmount === 345.6, `Expected 345.6, got ${totals3.finalAmount}`);
  console.log('✔ Calculation totals test passed (8kg @ ₹40 = ₹320 + ₹25.60 comm = ₹345.60)');

  // 3. Ensure test customer & vegetable exist
  let custAbhay = customerModel.findAll().find(c => c.name.includes('Abhay') || c.name.includes('अभय'));
  if (!custAbhay) {
    custAbhay = customerModel.create({ name: 'Abhay', mobile: '9876543210', address: 'Market' });
  }

  let custNirbhay = customerModel.findAll().find(c => c.name.includes('Nirbhay') || c.name.includes('निर्भय'));
  if (!custNirbhay) {
    custNirbhay = customerModel.create({ name: 'Nirbhay', mobile: '9876543211', address: 'Market' });
  }

  let vegOnion = vegetableModel.findAll().find(v => v.name.includes('Onion') || v.name.includes('कांदा'));
  if (!vegOnion) {
    vegOnion = vegetableModel.create({ name: 'Onion', rate: 30, unit: 'kg', search_keywords: 'kanda' });
  }

  let vegPotato = vegetableModel.findAll().find(v => v.name.includes('Potato') || v.name.includes('बटाटा'));
  if (!vegPotato) {
    vegPotato = vegetableModel.create({ name: 'Potato', rate: 25, unit: 'kg', search_keywords: 'batata' });
  }

  let vegTomato = vegetableModel.findAll().find(v => v.name.includes('Tomato') || v.name.includes('टोमॅटो'));
  if (!vegTomato) {
    vegTomato = vegetableModel.create({ name: 'Tomato', rate: 40, unit: 'kg', search_keywords: 'tomato' });
  }

  const today = transactionService.getLocalDateString();

  // 4. Create 3 transactions as described in requirement
  // Tx 1: Abhay -> Onion -> 10 kg -> ₹30 -> Save (Final = ₹324)
  const res1 = await transactionService.createTransaction({
    customer_id: custAbhay.id,
    vegetable_id: vegOnion.id,
    weight: 10,
    rate: 30,
    transaction_date: today
  });
  if (!res1.success) {
    console.error('res1 error:', res1);
  }
  console.assert(res1.success, `Tx1 creation failed: ${res1.error}`);
  console.assert(res1.data && res1.data.final_amount === 324, `Expected 324, got ${res1.data?.final_amount}`);

  console.log('✔ Transaction 1 created (Abhay -> Onion -> 10kg @ ₹30 = ₹324)');

  // Tx 2: Nirbhay -> Potato -> 5 kg -> ₹25 -> Save (Final = ₹135)
  const res2 = await transactionService.createTransaction({
    customer_id: custNirbhay.id,
    vegetable_id: vegPotato.id,
    weight: 5,
    rate: 25,
    transaction_date: today
  });
  console.assert(res2.success, `Tx2 creation failed: ${res2.error}`);
  console.assert(res2.data.final_amount === 135, `Expected 135, got ${res2.data.final_amount}`);
  console.log('✔ Transaction 2 created (Nirbhay -> Potato -> 5kg @ ₹25 = ₹135)');

  // Tx 3: Abhay -> Tomato -> 8 kg -> ₹40 -> Save (Final = ₹345.60)
  const res3 = await transactionService.createTransaction({
    customer_id: custAbhay.id,
    vegetable_id: vegTomato.id,
    weight: 8,
    rate: 40,
    transaction_date: today
  });
  console.assert(res3.success, `Tx3 creation failed: ${res3.error}`);
  console.assert(res3.data.final_amount === 345.6, `Expected 345.6, got ${res3.data.final_amount}`);
  console.log('✔ Transaction 3 created (Abhay -> Tomato -> 8kg @ ₹40 = ₹345.60)');

  // 5. Test Customer Daily Purchase Summary for Abhay (Should include Onion & Tomato)
  const dailyAbhay = await transactionService.getCustomerDailyPurchase(custAbhay.id, today);
  console.assert(dailyAbhay.success, 'Abhay daily purchase fetch failed');
  const sumAbhay = dailyAbhay.data.summary;
  console.log('Abhay Daily Purchase Summary:', sumAbhay);
  console.assert(sumAbhay.total_transactions >= 2, 'Abhay should have at least 2 transactions');
  console.assert(sumAbhay.total_final_amount >= 669.6, `Expected >= 669.6, got ${sumAbhay.total_final_amount}`);
  console.log('✔ Abhay daily purchase summary contains Onion + Tomato correctly!');

  // 6. Test Customer Daily Purchase Summary for Nirbhay (Should include Potato)
  const dailyNirbhay = await transactionService.getCustomerDailyPurchase(custNirbhay.id, today);
  console.assert(dailyNirbhay.success, 'Nirbhay daily purchase fetch failed');
  const sumNirbhay = dailyNirbhay.data.summary;
  console.log('Nirbhay Daily Purchase Summary:', sumNirbhay);
  console.assert(sumNirbhay.total_transactions >= 1, 'Nirbhay should have at least 1 transaction');
  console.assert(sumNirbhay.total_final_amount >= 135, `Expected >= 135, got ${sumNirbhay.total_final_amount}`);
  console.log('✔ Nirbhay daily purchase summary contains Potato correctly!');

  // 7. Test Bill Generation from today's transactions for Abhay
  const billRes = await transactionService.generateBillFromTransactions({ customerId: custAbhay.id, date: today });
  console.assert(billRes.success, `Bill generation failed: ${billRes.error}`);
  console.assert(billRes.data.bill_number.startsWith('BILL-'), `Expected bill number, got ${billRes.data?.bill_number}`);
  console.assert(billRes.data.items.length >= 2, `Expected at least 2 bill items, got ${billRes.data?.items?.length}`);
  console.log(`✔ Generated Today's Bill for Abhay successfully! Bill #: ${billRes.data.bill_number}, Items: ${billRes.data.items.length}`);

  console.log('=== ALL BACKEND TRANSACTIONS TESTS PASSED SUCCESSFULLY! ===');
}


runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
