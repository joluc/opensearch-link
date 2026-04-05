/*
 * Integration test: simulates the full plugin flow without OSD.
 * Tests RISON encoding, state building, and URL construction end-to-end.
 */

// Import the built JS modules directly
const { encodeRison } = require('../build/opensearch-link/server/lib/rison');
const { buildDiscoverUrl } = require('../build/opensearch-link/server/lib/state_builder');
const { RESERVED_PARAMS } = require('../build/opensearch-link/server/types');

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
    console.log(`    expected: ${JSON.stringify(expected)}`);
    console.log(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertIncludes(name, haystack, needle) {
  if (haystack.includes(needle)) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
    console.log(`    expected to contain: ${needle}`);
    console.log(`    actual: ${haystack}`);
    failed++;
  }
}

function assertStartsWith(name, str, prefix) {
  if (str.startsWith(prefix)) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
    console.log(`    expected to start with: ${prefix}`);
    console.log(`    actual: ${str}`);
    failed++;
  }
}

// ============================================================
console.log('\n=== 1. RISON Encoder ===\n');

// Primitives
assert('null', encodeRison(null), '!n');
assert('true', encodeRison(true), '!t');
assert('false', encodeRison(false), '!f');
assert('number', encodeRison(42), '42');
assert('empty string', encodeRison(''), "''");
assert('simple string', encodeRison('hello'), 'hello');
assert('string with dash', encodeRison('now-15m'), 'now-15m');
assert('string with colon', encodeRison('level:ERROR'), "'level:ERROR'");
assert('string with space', encodeRison('hello world'), "'hello world'");
assert('string with !', encodeRison('alert!'), "'alert!!'");
assert('string with parens', encodeRison('foo(bar)'), "'foo(bar)'");
assert('string starting with digit', encodeRison('123'), "'123'");
assert('string starting with -', encodeRison('-foo'), "'-foo'");

// Keys
assert('dotted key bare', encodeRison({ 'kubernetes.pod.name': 'x' }), '(kubernetes.pod.name:x)');
assert('$state key quoted', encodeRison({ '$state': 'x' }), "('$state':x)");
assert('@timestamp key quoted', encodeRison({ '@timestamp': 'x' }), "('@timestamp':x)");

// Structures
assert('empty array', encodeRison([]), '!()');
assert('empty object', encodeRison({}), '()');
assert('nested sort', encodeRison([['@timestamp', 'desc']]), "!(!('@timestamp',desc))");

// Real global state (compare against actual OSD output)
const gState = encodeRison({
  filters: [],
  refreshInterval: { pause: true, value: 0 },
  time: { from: 'now-15m', to: 'now' },
});
assert('global state matches OSD format',
  gState,
  '(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-15m,to:now))'
);

// ============================================================
console.log('\n=== 2. State Builder ===\n');

// Simple case: one filter, default time
const url1 = buildDiscoverUrl(
  { 'kubernetes.pod.name': 'my-pod-abc123' },
  'idx-uuid-123'
);
assertStartsWith('URL starts with /app/discover', url1, '/app/discover#/?_g=');
assertIncludes('has _a param', url1, '&_a=');
assertIncludes('has time from', url1, 'from:now-15m');
assertIncludes('has time to', url1, 'to:now');
assertIncludes('has match_phrase filter', url1, 'match_phrase:(kubernetes.pod.name:my-pod-abc123)');
assertIncludes('has index in state', url1, 'index:idx-uuid-123');
assertIncludes('has columns', url1, 'columns:!(message)');
assertIncludes('has sort', url1, "sort:!(!('@timestamp',desc))");
assertIncludes('has $state', url1, "'$state':(store:appState)");
assertIncludes('has meta.alias null', url1, 'alias:!n');
assertIncludes('has meta.params', url1, 'params:(query:my-pod-abc123)');

// Custom time
const url2 = buildDiscoverUrl(
  { 'kubernetes.pod.name': 'x', time: '1h' },
  undefined
);
assertIncludes('custom time 1h', url2, 'from:now-1h');

// Absolute time
const url3 = buildDiscoverUrl(
  { 'kubernetes.pod.name': 'x', from: '2026-04-05T10:00:00Z', to: '2026-04-05T10:30:00Z' },
  undefined
);
assertIncludes('absolute from', url3, "'2026-04-05T10:00:00Z'");
assertIncludes('absolute to', url3, "'2026-04-05T10:30:00Z'");

// No index pattern — should omit index from _a
const url4 = buildDiscoverUrl(
  { 'kubernetes.pod.name': 'x' },
  undefined
);
// index should not appear in _a (no index:xxx)
const aState4 = url4.split('&_a=')[1];
assert('no index when undefined', aState4.includes('index:'), false);

// Multiple filters
const url5 = buildDiscoverUrl(
  { 'kubernetes.pod.name': 'pod-a', 'kubernetes.namespace': 'prod', 'service.name': 'api' },
  'idx-1'
);
assertIncludes('filter 1', url5, 'kubernetes.pod.name:pod-a');
assertIncludes('filter 2', url5, 'kubernetes.namespace:prod');
assertIncludes('filter 3', url5, 'service.name:api');

// Custom columns
const url6 = buildDiscoverUrl(
  { 'kubernetes.pod.name': 'x', columns: 'message,level,trace.id' },
  undefined
);
assertIncludes('custom columns', url6, 'columns:!(message,level,trace.id)');

// KQL query
const url7 = buildDiscoverUrl(
  { 'kubernetes.pod.name': 'x', query: 'level:ERROR' },
  undefined
);
assertIncludes('kql query', url7, "query:'level:ERROR'");

// ============================================================
console.log('\n=== 3. Reserved Params ===\n');

assert('index is reserved', RESERVED_PARAMS.has('index'), true);
assert('time is reserved', RESERVED_PARAMS.has('time'), true);
assert('from is reserved', RESERVED_PARAMS.has('from'), true);
assert('to is reserved', RESERVED_PARAMS.has('to'), true);
assert('query is reserved', RESERVED_PARAMS.has('query'), true);
assert('columns is reserved', RESERVED_PARAMS.has('columns'), true);
assert('pod.name is NOT reserved', RESERVED_PARAMS.has('kubernetes.pod.name'), false);

// Reserved params should NOT become filters
const url8 = buildDiscoverUrl(
  { 'kubernetes.pod.name': 'x', time: '30m', index: 'custom-*', query: 'foo', columns: 'a,b' },
  'idx-1'
);
// time, index, query, columns should not be in filters
const aState8 = url8.split('&_a=')[1];
assert('time not a filter', aState8.includes("key:'time'") || aState8.includes('key:time,'), false);
assert('index not a filter key', (aState8.match(/key/g) || []).length, 1); // only kubernetes.pod.name

// ============================================================
console.log('\n=== 4. URL Decodability ===\n');

// The generated URL should be decodable — verify the RISON round-trips
// by checking structural integrity (balanced parens, no broken escapes)
function checkBalanced(name, rison) {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < rison.length; i++) {
    const c = rison[i];
    if (c === "'" && !inString) { inString = true; continue; }
    if (c === "'" && inString && rison[i - 1] !== '!') { inString = false; continue; }
    if (inString) continue;
    if (c === '(') depth++;
    if (c === ')') depth--;
  }
  assert(name, depth, 0);
}

const parts1 = url1.split('#/?')[1];
const gRison = parts1.split('&_a=')[0].replace('_g=', '');
const aRison = parts1.split('&_a=')[1];
checkBalanced('global state balanced', gRison);
checkBalanced('app state balanced', aRison);

// ============================================================
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  console.log('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
