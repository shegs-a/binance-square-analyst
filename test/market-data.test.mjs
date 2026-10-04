/**
 * Lightweight tests for api/market-data.js.
 *
 * No testing framework is introduced here — the repository has none, and
 * adding one solely for this endpoint would be disproportionate. This file
 * uses Node's built-in `assert` module and a hand-rolled req/res mock, and
 * runs with:
 *
 *   npm test
 *   (or: node test/market-data.test.mjs)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEST_SECRET = 'test-secret-value';
process.env.MARKET_DATA_SECRET = TEST_SECRET;

const handlerModule = await import('../api/market-data.js');
const handler = handlerModule.default;
const { parseSymbol, parseInterval, parseLimit, normalizeKlines } =
  handlerModule.__internal;

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(error);
  }
}

function makeReq({ query = {}, headers = {}, method = 'GET' } = {}) {
  const searchParams = new URLSearchParams(query).toString();
  return {
    method,
    headers,
    url: `/api/market-data${searchParams ? `?${searchParams}` : ''}`,
    query
  };
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {}
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  res.setHeader = (key, value) => {
    res.headers[key] = value;
  };
  return res;
}

function sampleKline({ openTime, open, high, low, close, volume, closeTime }) {
  return [
    openTime,
    String(open),
    String(high),
    String(low),
    String(close),
    String(volume),
    closeTime,
    '0', // quote asset volume
    0, // number of trades
    '0', // taker buy base volume
    '0', // taker buy quote volume
    '0' // ignore
  ];
}

function mockFetchOnce(responder) {
  globalThis.fetch = async (url, options) => responder(url, options);
}

// ---------------------------------------------------------------------------
// 1. Valid BTCUSDT/4h request succeeds
// ---------------------------------------------------------------------------
await test('valid BTCUSDT/4h request succeeds with numeric OHLCV fields', async () => {
  const now = Date.now();
  mockFetchOnce(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify([
        sampleKline({
          openTime: now - 4 * 60 * 60 * 1000,
          open: 84840.88,
          high: 85112.65,
          low: 84808.11,
          close: 85106,
          volume: 1234.56,
          closeTime: now + 1000 // still forming
        })
      ])
  }));

  const req = makeReq({
    query: { symbol: 'BTCUSDT', interval: '4h', limit: '100' },
    headers: { 'x-market-data-secret': TEST_SECRET }
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.symbol, 'BTCUSDT');
  assert.equal(res.body.interval, '4h');
  assert.equal(res.body.candles.length, 1);

  const candle = res.body.candles[0];
  for (const field of ['openTime', 'open', 'high', 'low', 'close', 'volume', 'closeTime']) {
    assert.equal(typeof candle[field], 'number', `${field} should be a number`);
  }

  assert.equal(res.body.lastCandle.isClosed, false);
  assert.equal(res.body.candleStatus.lastCandle, 'possibly_incomplete');
});

// ---------------------------------------------------------------------------
// 2. ETHUSDT/1h succeeds
// ---------------------------------------------------------------------------
await test('valid ETHUSDT/1h request succeeds', async () => {
  const now = Date.now();
  mockFetchOnce(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify([
        sampleKline({
          openTime: now - 2 * 60 * 60 * 1000,
          open: 3200.5,
          high: 3250,
          low: 3190,
          close: 3240,
          volume: 500,
          closeTime: now - 60 * 60 * 1000 // closed
        })
      ])
  }));

  const req = makeReq({
    query: { symbol: 'ETHUSDT', interval: '1h' },
    headers: { 'x-market-data-secret': TEST_SECRET }
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.symbol, 'ETHUSDT');
  assert.equal(res.body.lastCandle.isClosed, true);
  assert.equal(res.body.candleStatus.lastCandle, 'closed');
});

// ---------------------------------------------------------------------------
// 3. BNBUSDT/15m succeeds
// ---------------------------------------------------------------------------
await test('valid BNBUSDT/15m request succeeds', async () => {
  mockFetchOnce(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify([
        sampleKline({
          openTime: 1,
          open: 600,
          high: 610,
          low: 595,
          close: 605,
          volume: 10,
          closeTime: 2
        })
      ])
  }));

  const req = makeReq({
    query: { symbol: 'BNBUSDT', interval: '15m' },
    headers: { 'x-market-data-secret': TEST_SECRET }
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.symbol, 'BNBUSDT');
  assert.equal(res.body.interval, '15m');
});

// ---------------------------------------------------------------------------
// 4. Unsupported symbol returns 400
// ---------------------------------------------------------------------------
await test('unsupported symbol returns 400', async () => {
  const req = makeReq({
    query: { symbol: 'DOGEUSDT' },
    headers: { 'x-market-data-secret': TEST_SECRET }
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
});

// ---------------------------------------------------------------------------
// 5. Unsupported interval returns 400
// ---------------------------------------------------------------------------
await test('unsupported interval returns 400', async () => {
  const req = makeReq({
    query: { interval: '2h' },
    headers: { 'x-market-data-secret': TEST_SECRET }
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
});

// ---------------------------------------------------------------------------
// 6. Invalid limit returns 400
// ---------------------------------------------------------------------------
await test('invalid limit (too large) returns 400', async () => {
  const req = makeReq({
    query: { limit: '5000' },
    headers: { 'x-market-data-secret': TEST_SECRET }
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
});

await test('invalid limit (non-numeric) returns 400', async () => {
  const req = makeReq({
    query: { limit: 'abc' },
    headers: { 'x-market-data-secret': TEST_SECRET }
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
});

// ---------------------------------------------------------------------------
// 7. Missing authentication returns 401
// ---------------------------------------------------------------------------
await test('missing x-market-data-secret header returns 401', async () => {
  const req = makeReq({ headers: {} });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error, 'Unauthorized');
});

// ---------------------------------------------------------------------------
// 8. Incorrect authentication returns 401
// ---------------------------------------------------------------------------
await test('incorrect x-market-data-secret header returns 401', async () => {
  const req = makeReq({ headers: { 'x-market-data-secret': 'wrong-secret' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.ok, false);
});

// ---------------------------------------------------------------------------
// 9. Binance upstream failure is handled cleanly
// ---------------------------------------------------------------------------
await test('Binance non-2xx response returns 502, not a crash', async () => {
  mockFetchOnce(async () => ({
    ok: false,
    status: 418,
    text: async () => JSON.stringify({ code: -1100, msg: "I'm a teapot" })
  }));

  const req = makeReq({ headers: { 'x-market-data-secret': TEST_SECRET } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.ok, false);
});

await test('network error contacting Binance returns 502, not a crash', async () => {
  globalThis.fetch = async () => {
    throw new Error('network down');
  };

  const req = makeReq({ headers: { 'x-market-data-secret': TEST_SECRET } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.ok, false);
});

await test('malformed Binance response returns 502, not a crash', async () => {
  mockFetchOnce(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ not: 'an array' })
  }));

  const req = makeReq({ headers: { 'x-market-data-secret': TEST_SECRET } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.ok, false);
});

// ---------------------------------------------------------------------------
// 10. Returned candles contain numeric OHLCV fields (unit test on normalizer)
// ---------------------------------------------------------------------------
await test('normalizeKlines converts Binance strings into real numbers', () => {
  const now = Date.now();
  const result = normalizeKlines([
    sampleKline({
      openTime: now - 1000,
      open: '100.5',
      high: '101',
      low: '99',
      close: '100.9',
      volume: '42',
      closeTime: now - 500
    })
  ]);

  const candle = result.candles[0];
  assert.equal(candle.open, 100.5);
  assert.equal(candle.high, 101);
  assert.equal(candle.low, 99);
  assert.equal(candle.close, 100.9);
  assert.equal(candle.volume, 42);
  assert.equal(typeof candle.openTime, 'number');
  assert.equal(typeof candle.closeTime, 'number');
});

await test('normalizeKlines throws on non-array input', () => {
  assert.throws(() => normalizeKlines({ not: 'an array' }));
});

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------
await test('parseSymbol accepts lowercase input and normalizes to uppercase', () => {
  const result = parseSymbol('btcusdt');
  assert.equal(result.value, 'BTCUSDT');
});

await test('parseSymbol defaults to BTCUSDT when absent', () => {
  const result = parseSymbol(undefined);
  assert.equal(result.value, 'BTCUSDT');
});

await test('parseInterval defaults to 4h when absent', () => {
  const result = parseInterval(undefined);
  assert.equal(result.value, '4h');
});

await test('parseLimit defaults to 100 when absent', () => {
  const result = parseLimit(undefined);
  assert.equal(result.value, 100);
});

await test('parseLimit rejects zero and negative values', () => {
  assert.ok(parseLimit('0').error);
  assert.ok(parseLimit('-5').error);
});

// ---------------------------------------------------------------------------
// 11. No secrets are present in the source code
// ---------------------------------------------------------------------------
await test('source file contains no hardcoded secret values', () => {
  const sourcePath = fileURLToPath(new URL('../api/market-data.js', import.meta.url));
  const source = readFileSync(sourcePath, 'utf8');

  // The secret must only ever be read from process.env, never assigned a
  // literal value.
  assert.ok(source.includes('process.env.MARKET_DATA_SECRET'));
  assert.ok(!/MARKET_DATA_SECRET\s*=\s*['"`][^'"`]+['"`]/.test(source));
  assert.ok(!source.includes(TEST_SECRET));
});

// ---------------------------------------------------------------------------
// Method guard
// ---------------------------------------------------------------------------
await test('non-GET method returns 405', async () => {
  const req = makeReq({ method: 'POST', headers: { 'x-market-data-secret': TEST_SECRET } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
});

// ---------------------------------------------------------------------------
// Missing server configuration
// ---------------------------------------------------------------------------
await test('missing MARKET_DATA_SECRET env var returns 500, not 401', async () => {
  delete process.env.MARKET_DATA_SECRET;

  const req = makeReq({ headers: { 'x-market-data-secret': 'anything' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);

  process.env.MARKET_DATA_SECRET = TEST_SECRET;
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
