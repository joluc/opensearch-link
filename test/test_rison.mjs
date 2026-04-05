/*
 * Standalone test for RISON encoder and state builder.
 * Run with: node --experimental-specifier-resolution=node test/test_rison.mjs
 *
 * This imports the TypeScript source via a small shim since we can't use ts-node
 * outside the OSD build. Instead, we replicate the logic and test the output format.
 */

// ---- Inline RISON encoder (copy from server/lib/rison.ts) ----

const BARE_OK = /^[^ '!:(),*@$\-0-9][^ '!:(),*@$]*$/;

function encodeRison(value) {
  if (value === null || value === undefined) return '!n';
  if (typeof value === 'boolean') return value ? '!t' : '!f';
  if (typeof value === 'number') {
    if (!isFinite(value)) return '!n';
    return String(value);
  }
  if (typeof value === 'string') return encodeString(value);
  if (Array.isArray(value)) return '!(' + value.map(encodeRison).join(',') + ')';
  if (typeof value === 'object') {
    const parts = Object.entries(value).map(([k, v]) => encodeKey(k) + ':' + encodeRison(v));
    return '(' + parts.join(',') + ')';
  }
  return '!n';
}

function encodeKey(key) {
  if (key.length > 0 && BARE_OK.test(key)) return key;
  return encodeString(key);
}

function encodeString(s) {
  if (s === '') return "''";
  if (BARE_OK.test(s)) return s;
  return "'" + s.replace(/[!']/g, (c) => '!' + c) + "'";
}

// ---- Tests ----

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
    console.log(`    expected: ${expected}`);
    console.log(`    actual:   ${actual}`);
    failed++;
  }
}

console.log('=== RISON Encoder Tests ===\n');

// Primitives
assert('null', encodeRison(null), '!n');
assert('true', encodeRison(true), '!t');
assert('false', encodeRison(false), '!f');
assert('number 0', encodeRison(0), '0');
assert('number 42', encodeRison(42), '42');
assert('number -1.5', encodeRison(-1.5), '-1.5');

// Strings
assert('empty string', encodeRison(''), "''");
assert('simple alpha', encodeRison('hello'), 'hello');
assert('string with dash start', encodeRison('-foo'), "'-foo'");
assert('string starting with digit', encodeRison('123abc'), "'123abc'");
assert('string with spaces', encodeRison('hello world'), "'hello world'");
assert('string with colon', encodeRison('level:ERROR'), "'level:ERROR'");
assert('string with single quote', encodeRison("it's"), "'it!'s'");
assert('string with !', encodeRison('alert!'), "'alert!!'");
assert('string with parens', encodeRison('foo(bar)'), "'foo(bar)'");

// Key encoding
assert('simple key', encodeKey('foo'), 'foo');
assert('dotted key', encodeKey('kubernetes.pod.name'), 'kubernetes.pod.name');
assert('key with @', encodeKey('@timestamp'), "'@timestamp'");
assert('key with $', encodeKey('$state'), "'$state'");

// Arrays
assert('empty array', encodeRison([]), '!()');
assert('array of strings', encodeRison(['a', 'b']), '!(a,b)');
assert('nested array', encodeRison([['@timestamp', 'desc']]), "!(!('@timestamp',desc))");

// Objects
assert('empty object', encodeRison({}), '()');
assert('simple object', encodeRison({ a: 1 }), '(a:1)');
assert('nested object', encodeRison({ time: { from: 'now-15m', to: 'now' } }),
  '(time:(from:now-15m,to:now))');

// Real-world: global state
const globalState = {
  filters: [],
  refreshInterval: { pause: true, value: 0 },
  time: { from: 'now-15m', to: 'now' },
};
const gEncoded = encodeRison(globalState);
console.log(`\n  Global state RISON:\n    ${gEncoded}`);
assert('global state has filters', gEncoded.includes('filters:!()'), true);
assert('global state has pause', gEncoded.includes('pause:!t'), true);
assert('global state has time.from', gEncoded.includes('from:now-15m'), true);

// Real-world: filter object
const filter = {
  $state: { store: 'appState' },
  meta: {
    alias: null,
    disabled: false,
    index: 'abc-123',
    key: 'kubernetes.pod.name',
    negate: false,
    params: { query: 'my-pod-xyz' },
    type: 'phrase',
  },
  query: {
    match_phrase: {
      'kubernetes.pod.name': 'my-pod-xyz',
    },
  },
};
const fEncoded = encodeRison(filter);
console.log(`\n  Filter RISON:\n    ${fEncoded}`);
assert('filter has $state', fEncoded.includes("'$state':(store:appState)"), true);
assert('filter has alias null', fEncoded.includes('alias:!n'), true);
assert('filter has disabled false', fEncoded.includes('disabled:!f'), true);
assert('filter has match_phrase', fEncoded.includes('match_phrase:(kubernetes.pod.name'), true);

// Real-world: full app state
const appState = {
  columns: ['message'],
  filters: [filter],
  interval: 'auto',
  query: { language: 'kuery', query: '' },
  sort: [['@timestamp', 'desc']],
};
const aEncoded = encodeRison(appState);
console.log(`\n  App state RISON:\n    ${aEncoded}`);
assert('app state has columns', aEncoded.includes('columns:!(message)'), true);
assert('app state has sort', aEncoded.includes("sort:!(!('@timestamp',desc))"), true);
assert('app state has empty query', aEncoded.includes("query:(language:kuery,query:'')"), true);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
