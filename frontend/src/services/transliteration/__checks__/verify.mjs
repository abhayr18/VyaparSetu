/**
 * verify.mjs — transliteration accuracy check.
 *
 * There is no test harness on the frontend, so this runs under plain `node`:
 *
 *   cd frontend && node src/services/transliteration/__checks__/verify.mjs
 *
 * Every case must pass. The table below is not a sample of arbitrary words — it is the
 * vocabulary this shop types (vegetables, fruits, रानभाज्या, first names, 96-Kuli
 * surnames) plus one case for each specific defect in the hand-rolled map this service
 * replaced. A regression in any single rule shows up as a named failure.
 *
 * Because imports must resolve without a bundler, every path in this service carries an
 * explicit .js extension — the same deliberate exception utils/billDisplay.js makes.
 */
import {
  getSuggestions,
  transliterate,
  setProvider,
  getProviderName,
} from '../index.js';
import { WORD_DICT, WORD_DICT_SIZE } from '../wordDictionary.js';
import { romanToItrans } from '../romanToItrans.js';
import { applyMarathiOrthography } from '../marathiOrthography.js';

let pass = 0;
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`ok    ${label}`); }
  else { failures.push({ label, actual, expected }); console.log(`FAIL  ${label}`); }
}

/** The word's best suggestion — what a vendor gets by pressing Space. */
function top(word) {
  return getSuggestions(word)[0] || '';
}

/** Whether the word appears anywhere in the dropdown. */
function offers(word, expected) {
  return getSuggestions(word).includes(expected);
}

// ───────────────────────────────────────────────────────────────────────────────
// 1. The shop's vocabulary. These must be the FIRST suggestion, because the vendor
//    presses Space and moves on — a correct answer sitting third is a wrong answer.
// ───────────────────────────────────────────────────────────────────────────────
const VOCABULARY = [
  // Vegetables
  ['batata',    'बटाटा'],
  ['kanda',     'कांदा'],
  ['vangi',     'वांगी'],
  ['bhendi',    'भेंडी'],
  ['kothimbir', 'कोथिंबीर'],
  ['methi',     'मेथी'],
  ['shepu',     'शेपू'],
  ['mula',      'मुळा'],
  ['dodka',     'दोडका'],
  ['palak',     'पालक'],
  ['karle',     'कारले'],
  ['gajar',     'गाजर'],
  ['kakdi',     'काकडी'],
  ['lasun',     'लसूण'],
  ['tondli',    'तोंडली'],
  ['padwal',    'पडवळ'],
  ['shevga',    'शेवगा'],
  ['mirchi',    'मिरची'],
  // Fruits
  ['amba',      'आंबा'],
  ['kalingad',  'कलिंगड'],
  ['drakshe',   'द्राक्षे'],
  ['naral',     'नारळ'],
  ['keli',      'केळी'],
  // रानभाज्या
  ['kurdu',     'कुर्डू'],
  ['ghevda',    'घेवडा'],
  ['halad',     'हळद'],
  // Surnames
  ['patil',     'पाटील'],
  ['shinde',    'शिंदे'],
  ['jadhav',    'जाधव'],
  ['thorat',    'थोरात'],
  ['kulkarni',  'कुलकर्णी'],
  ['deshmukh',  'देशमुख'],
  ['gaikwad',   'गायकवाड'],
  ['thakre',    'ठाकरे'],
  ['tilak',     'टिळक'],
  ['mhatre',    'म्हात्रे'],
  ['salunkhe',  'साळुंखे'],
  // First names
  ['ganesh',    'गणेश'],
  ['shrikant',  'श्रीकांत'],
  ['dnyanesh',  'ज्ञानेश'],
  ['kiran',     'किरण'],
];

console.log('── vocabulary (must be the first suggestion) ──');
for (const [roman, marathi] of VOCABULARY) {
  check(`${roman} → ${marathi}`, top(roman), marathi);
}

// ───────────────────────────────────────────────────────────────────────────────
// 2. The specific defects in the map this service replaced. None of these words is
//    in the dictionary, so each one proves a RULE rather than a lookup.
// ───────────────────────────────────────────────────────────────────────────────
console.log('\n── the bugs being fixed (rule-level, no dictionary entry) ──');

// The old map sent `th` to त. थ and त are different letters and different words.
check('th → थ not त (thoda)', top('thoda'), 'थोद');
check('a retroflex ट is reachable at all (thoda)', offers('thoda', 'ठोड'), true);

// The old map had no retroflex consonants whatsoever, so ट was unreachable from `t`.
check('t offers both त and ट (tup)', getSuggestions('tup'), ['तुप', 'टुप']);
check('d offers both द and ड (dahi)', getSuggestions('dahi'), ['दही', 'डही']);
check('l offers both ल and ळ (tel)',  offers('tel', 'तेळ'), true);

// The old map sent `ng` to ञ and `nh` to ण, neither of which is what those spell.
check('ng → रंग not रञ्ग', top('rang'), 'रंग');
// न्ह, not ण — and the final ी is the word-final-vowel rule doing its job (न्हावी).
check('nh stays न्ह, not ण', top('nhavi'), 'न्हवी');

// ───────────────────────────────────────────────────────────────────────────────
// 3. Nasals. The single largest correctness win, and the rule with the most
//    exceptions — so each exception gets its own case.
// ───────────────────────────────────────────────────────────────────────────────
console.log('\n── nasals: anusvara where Marathi writes one, conjunct where it does not ──');
check('n + consonant → anusvara (chinch)', top('chinch'), 'चिंच');
check('n + s → anusvara (ansh)',           top('ansh'),   'अंश');
check('n + v → anusvara (sanvad)',         top('sanvad'), 'संवद');
check('m + b → anusvara (kumbh)',          top('kumbh'),  'कुंभ');
check('n + m stays न्म (janm)',            top('janm'),   'जन्म');
check('n + y stays न्य (kanya)',           top('kanya'),  'कन्य');
check('n + n stays न्न (anna)',            top('anna'),   'अन्न');
check('word-final n stays न (mohan)',      top('mohan'),  'मोहन');

// ───────────────────────────────────────────────────────────────────────────────
// 4. Rules that infer something the letters do not say outright.
// ───────────────────────────────────────────────────────────────────────────────
console.log('\n── inference ──');
// ष is always followed by a retroflex ट/ठ in Marathi, so `sht` is one place
// retroflexion can be deduced rather than guessed.
check('sht → ष्ट (kasht)',      top('kasht'),   'कष्ट');
check('shtr → ष्ट्र (rashtra)', top('rashtra'), 'रष्ट्र');
// शिस्त must NOT be caught by that rule — there the sh is followed by a vowel.
check('sh + vowel is untouched (shista)', top('shista'), 'शिस्त');

// Marathi has no word-final short इ or उ.
check('final i is long (kobi)',   top('kobi'),   'कोबी');
check('final u is long (bajhu)',  top('bajhu'),  'बझू');
check('a final diphthong survives (jai)', offers('jai', 'जय') || offers('jai', 'जै'), true);

// A trailing halant is an artefact of the scheme, never Marathi spelling.
check('trailing halant is stripped (sant)', offers('sant', 'संत'), true);
check('halant strip is direct',  applyMarathiOrthography('पाटील्'), 'पाटील');

// ───────────────────────────────────────────────────────────────────────────────
// 5. Nukta. ITRANS maps q, f and z to क़, फ़ and ज़ — Urdu and Persian letters that
//    Marathi does not use and that render as visibly foreign text.
// ───────────────────────────────────────────────────────────────────────────────
console.log('\n── no nukta leaks into Marathi text ──');
check('f → फ not फ़ (faltu)',  top('faltu'), 'फल्तू');
check('z → झ not ज़ (zopa)',   top('zopa'),  'झोप');
check('q → क not क़ (quilt)',  top('quilt'), 'कुइल्त');
check('x → क्ष (xerox)',       top('xerox'), 'क्षेरोक्ष');
check('no nukta anywhere in the vocabulary', VOCABULARY.every(([r]) => !/़/.test(top(r))), true);
check('nukta strip is direct', applyMarathiOrthography('क़ाज़ी'), 'काजी');

// ───────────────────────────────────────────────────────────────────────────────
// 6. The contract MarathiInput, CustomerAutocomplete and VegetableAutocomplete rely on.
//    Breaking any of these breaks an input box rather than a spelling.
// ───────────────────────────────────────────────────────────────────────────────
console.log('\n── the contract the input components depend on ──');
check('empty string → []',      getSuggestions(''),        []);
check('null → []',              getSuggestions(null),      []);
check('undefined → []',         getSuggestions(undefined), []);
check('whitespace → []',        getSuggestions('   '),     []);
check('digits only → []',       getSuggestions('123'),     []);
check('never more than five',   getSuggestions('ka').length <= 5, true);
check('no duplicates',          (() => { const s = getSuggestions('ka'); return s.length === new Set(s).size; })(), true);
check('every suggestion is a non-empty string',
  getSuggestions('patil').every((s) => typeof s === 'string' && s.length > 0), true);
check('no Latin passthrough in suggestions',
  getSuggestions('qwrtyp').every((s) => !/[a-z]/i.test(s)), true);
check('input already in Marathi is left alone', getSuggestions('कांदा'), []);
check('uppercase input works',  top('BATATA'),   'बटाटा');
check('surrounding spaces trimmed', top('  Patil  '), 'पाटील');
check('punctuation does not defeat the dictionary', top('ka-nda'), 'कांदा');
check('transliterate returns one string', transliterate('batata'), 'बटाटा');
check('transliterate on garbage never throws', typeof transliterate('zzz'), 'string');

// ───────────────────────────────────────────────────────────────────────────────
// 7. The dictionary itself.
// ───────────────────────────────────────────────────────────────────────────────
console.log('\n── dictionary integrity ──');
check('all 733 entries survived the move', WORD_DICT_SIZE, 733);
check('every key is lowercase, letters only',
  Object.keys(WORD_DICT).every((k) => /^[a-z]+$/.test(k)), true);
check('every value is a non-empty array of Devanagari',
  Object.values(WORD_DICT).every(
    (v) => Array.isArray(v) && v.length > 0 && v.every((w) => /[ऀ-ॿ]/.test(w))
  ), true);

// ───────────────────────────────────────────────────────────────────────────────
// 8. The replaceable seam. This is the requirement that the engine be swappable, so
//    it is checked rather than asserted in a comment.
// ───────────────────────────────────────────────────────────────────────────────
console.log('\n── the provider seam ──');
check('default provider is the rule engine', getProviderName(), 'indic-rules');
// The nasal rule fired (n → M) but the final-vowel rule did not, because the word ends in
// a consonant. So the rules alone give कोथिंबिर and the long ी of कोथिंबीर comes from the
// dictionary — which is exactly the division of labour the two layers are there for.
check('romanToItrans is usable on its own', romanToItrans('kothimbir'), 'kothiMbir');

setProvider({ name: 'stub', transliterate: () => 'स्टब' });
check('setProvider swaps the engine', getProviderName(), 'stub');
check('a swapped provider is used for unknown words', getSuggestions('qqqqq'), ['स्टब']);
check('a swapped provider does not cost the shop its dictionary', top('batata'), 'बटाटा');
check('a provider without transliterate is refused', (() => {
  try { setProvider({}); return 'accepted'; } catch { return 'refused'; }
})(), 'refused');

// Put the real engine back so a later addition to this file is not run against the stub.
setProvider((await import('../indicRuleProvider.js')).indicRuleProvider);
check('the real engine is restored', getProviderName(), 'indic-rules');

// ───────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} FAILED:\n`);
  for (const f of failures) {
    console.error(`  ${f.label}`);
    console.error(`    expected ${JSON.stringify(f.expected)}`);
    console.error(`    actual   ${JSON.stringify(f.actual)}\n`);
  }
  console.error(`${pass}/${pass + failures.length} passed`);
  process.exit(1);
}
console.log(`${pass}/${pass} passed`);
