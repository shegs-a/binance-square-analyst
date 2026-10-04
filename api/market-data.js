/**
 * Binance Square Analyst — Market Data Gateway
 *
 * This Vercel serverless function is a thin, authenticated proxy in front
 * of Binance's public Spot market-data API. It exists so that an external
 * reasoning workflow (ChatGPT) can request clean OHLCV candle data without
 * talking to Binance directly and without any Binance credentials ever
 * being involved.
 *
 * This function deliberately does NOT perform any technical analysis.
 * It does not compute SMC structure, BOS/CHOCH, order blocks, fair value
 * gaps, trend bias, or trading signals of any kind. It only retrieves and
 * normalizes raw candle data. All reasoning stays in the calling workflow.
 *
 * Endpoint:
 *   GET /api/market-data
 *
 * Required environment variable:
 *   MARKET_DATA_SECRET - Shared secret used to authenticate callers
 *
 * Request headers:
 *   x-market-data-secret: <MARKET_DATA_SECRET>
 *
 * Query parameters:
 *   symbol   - One of: BTCUSDT, ETHUSDT, BNBUSDT (default: BTCUSDT)
 *   interval - One of: 1d, 4h, 1h, 15m, 5m        (default: 4h)
 *   limit    - Integer between 1 and 500           (default: 100)
 *
 * Upstream:
 *   https://data-api.binance.vision/api/v3/klines
 *   (Binance's public, unauthenticated Spot market-data endpoint — no
 *   Binance API key is used or required.)
 *
 * Notes:
 * - No database, queue, or cron job is used. This is a stateless proxy.
 * - The most recent candle may still be forming. It is never dropped, but
 *   its closed/open status is reported so the caller can reason about it
 *   correctly.
 */

const BINANCE_KLINES_URL = 'https://data-api.binance.vision/api/v3/klines';

const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
const SUPPORTED_INTERVALS = ['1d', '4h', '1h', '15m', '5m'];

const DEFAULT_SYMBOL = 'BTCUSDT';
const DEFAULT_INTERVAL = '4h';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MIN_LIMIT = 1;

const UPSTREAM_TIMEOUT_MS = 8000;

/**
 * Read query parameters in a way that works whether or not the Vercel
 * runtime has already parsed them onto req.query.
 */
function getQueryParams(req) {
  if (req.query && typeof req.query === 'object') {
    return req.query;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

/**
 * Validate and normalize the symbol query parameter.
 * Returns { value } on success or { error } on failure.
 */
function parseSymbol(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { value: DEFAULT_SYMBOL };
  }

  const value = String(raw).trim().toUpperCase();

  if (!SUPPORTED_SYMBOLS.includes(value)) {
    return {
      error: `Unsupported symbol "${raw}". Supported symbols: ${SUPPORTED_SYMBOLS.join(', ')}.`
    };
  }

  return { value };
}

/**
 * Validate and normalize the interval query parameter.
 */
function parseInterval(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { value: DEFAULT_INTERVAL };
  }

  const value = String(raw).trim().toLowerCase();

  if (!SUPPORTED_INTERVALS.includes(value)) {
    return {
      error: `Unsupported interval "${raw}". Supported intervals: ${SUPPORTED_INTERVALS.join(', ')}.`
    };
  }

  return { value };
}

/**
 * Validate and normalize the limit query parameter.
 */
function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { value: DEFAULT_LIMIT };
  }

  const value = Number(raw);

  if (
    !Number.isInteger(value) ||
    value < MIN_LIMIT ||
    value > MAX_LIMIT
  ) {
    return {
      error: `Invalid limit "${raw}". Must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}.`
    };
  }

  return { value };
}

/**
 * Convert a single raw Binance kline array into a clean object.
 *
 * Binance kline array shape:
 *   [ openTime, open, high, low, close, volume, closeTime,
 *     quoteAssetVolume, numberOfTrades, takerBuyBaseVolume,
 *     takerBuyQuoteVolume, ignore ]
 *
 * Only the fields relevant to OHLCV analysis are kept. Values are
 * converted to real JSON numbers; nothing is computed, smoothed, or
 * interpolated.
 */
function normalizeCandle(kline) {
  const [
    openTime,
    open,
    high,
    low,
    close,
    volume,
    closeTime
  ] = kline;

  return {
    openTime: Number(openTime),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume),
    closeTime: Number(closeTime)
  };
}

/**
 * Normalize the full Binance klines response and attach metadata about
 * whether the final (most recent) candle has actually closed yet.
 */
function normalizeKlines(rawKlines) {
  if (!Array.isArray(rawKlines)) {
    throw new Error('Unexpected Binance response shape (expected an array).');
  }

  const candles = rawKlines.map(normalizeCandle);

  let lastCandle = null;

  if (candles.length > 0) {
    const last = candles[candles.length - 1];
    const now = Date.now();
    const isClosed = Number.isFinite(last.closeTime) && last.closeTime < now;

    lastCandle = {
      openTime: last.openTime,
      closeTime: last.closeTime,
      isClosed
    };
  }

  return {
    candles,
    candleStatus: {
      lastCandle: lastCandle && lastCandle.isClosed
        ? 'closed'
        : 'possibly_incomplete'
    },
    lastCandle
  };
}

/**
 * Fetch klines from Binance's public market-data API with a bounded
 * timeout so an upstream hang can never stall this function indefinitely.
 */
async function fetchBinanceKlines(symbol, interval, limit) {
  const params = new URLSearchParams({
    symbol,
    interval,
    limit: String(limit)
  });

  const url = `${BINANCE_KLINES_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw Object.assign(
        new Error('Binance returned a non-JSON response.'),
        { upstreamStatus: response.status }
      );
    }

    if (!response.ok) {
      throw Object.assign(
        new Error('Binance API returned a non-2xx response.'),
        { upstreamStatus: response.status, upstreamBody: data }
      );
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  // This endpoint is intentionally read-only.
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed. Use GET.'
    });
  }

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------
  //
  // The caller must know the shared MARKET_DATA_SECRET. This is a separate
  // secret from BRIDGE_SECRET — this endpoint has nothing to do with the
  // Telegram delivery bridge.
  const marketDataSecret = process.env.MARKET_DATA_SECRET;

  if (!marketDataSecret) {
    console.error('MARKET_DATA_SECRET is not configured.');
    return res.status(500).json({
      ok: false,
      error: 'Market data environment variable is not configured.'
    });
  }

  if (req.headers['x-market-data-secret'] !== marketDataSecret) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized'
    });
  }

  // -----------------------------------------------------------------------
  // Input validation
  // -----------------------------------------------------------------------
  const query = getQueryParams(req);

  const symbolResult = parseSymbol(query.symbol);
  if (symbolResult.error) {
    return res.status(400).json({ ok: false, error: symbolResult.error });
  }

  const intervalResult = parseInterval(query.interval);
  if (intervalResult.error) {
    return res.status(400).json({ ok: false, error: intervalResult.error });
  }

  const limitResult = parseLimit(query.limit);
  if (limitResult.error) {
    return res.status(400).json({ ok: false, error: limitResult.error });
  }

  const symbol = symbolResult.value;
  const interval = intervalResult.value;
  const limit = limitResult.value;

  // -----------------------------------------------------------------------
  // Upstream request + normalization
  // -----------------------------------------------------------------------
  let rawKlines;

  try {
    rawKlines = await fetchBinanceKlines(symbol, interval, limit);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Binance request timed out:', { symbol, interval, limit });
      return res.status(504).json({
        ok: false,
        error: 'Timed out while contacting Binance.'
      });
    }

    if (error.upstreamStatus) {
      console.error('Binance API error:', {
        status: error.upstreamStatus,
        body: error.upstreamBody,
        symbol,
        interval,
        limit
      });
      return res.status(502).json({
        ok: false,
        error: 'Binance API returned an error.'
      });
    }

    console.error('Failed to contact Binance:', error);
    return res.status(502).json({
      ok: false,
      error: 'Unable to contact Binance.'
    });
  }

  let normalized;

  try {
    normalized = normalizeKlines(rawKlines);
  } catch (error) {
    console.error('Failed to normalize Binance response:', error);
    return res.status(502).json({
      ok: false,
      error: 'Binance returned a malformed response.'
    });
  }

  return res.status(200).json({
    ok: true,
    source: 'binance',
    symbol,
    interval,
    limit,
    candles: normalized.candles,
    candleStatus: normalized.candleStatus,
    lastCandle: normalized.lastCandle
  });
}

export const __internal = {
  parseSymbol,
  parseInterval,
  parseLimit,
  normalizeCandle,
  normalizeKlines
};
