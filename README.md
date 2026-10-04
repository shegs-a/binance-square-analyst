# Binance Square Analyst

A small, secure set of **Vercel serverless functions** supporting the Binance Square Analyst workflow: a market-data gateway that retrieves public Binance OHLCV data, and a delivery bridge that posts finished content packs to a private Telegram chat.

This repository is intentionally lightweight. It does **not** perform market analysis itself. Its jobs are to (1) provide clean, normalized Binance candle data to the external SMC reasoning workflow, and (2) securely deliver that workflow's finished content to Telegram.

---

## Architecture

```text
┌─────────────────────────────┐
│ Binance Public Market Data  │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ SMC Analysis / Content      │
│ Generation Workflow         │
└──────────────┬──────────────┘
               │
               │ POST /api/telegram
               │ x-bridge-secret
               ▼
┌─────────────────────────────┐
│ Vercel Serverless Function  │
│ api/telegram.js             │
└──────────────┬──────────────┘
               │
               │ Telegram Bot API
               ▼
┌─────────────────────────────┐
│ Private Telegram Chat       │
└─────────────────────────────┘
```

The bridge keeps the Telegram BotFather token on the server. The caller only needs the shared `BRIDGE_SECRET`.

---

# Features

- Vercel serverless function
- Node.js 20+
- Shared-secret authentication
- Telegram Bot API integration
- Automatic Telegram 4096-character message splitting
- Splitting prefers paragraph/newline boundaries
- Safe HTML escaping
- Sequential delivery preserves message order
- No Telegram credentials in request payloads
- No database required
- No external npm dependencies
- Detailed error responses
- Production-oriented comments and documentation

---

# Repository Structure

```text
binance-square-analyst/
├── api/
│   ├── telegram.js       # Vercel serverless Telegram endpoint
│   └── market-data.js    # Vercel serverless Binance market-data gateway
├── test/
│   └── market-data.test.mjs  # Lightweight tests for the market-data gateway
├── package.json          # Minimal Node/Vercel project metadata
└── README.md             # This documentation
```

---

# 1. Create the Telegram Bot

If you have already created the bot through BotFather, you can skip this section.

In Telegram:

1. Open **@BotFather**.
2. Run `/newbot`.
3. Give the bot a name.
4. Give it a unique username ending in `bot`.
5. BotFather will provide a bot token.

### IMPORTANT

**Do not commit the BotFather token to GitHub.**

Do not put it in:

- `telegram.js`
- `README.md`
- `.env` committed to Git
- request bodies
- screenshots
- public documentation

The token belongs only in Vercel's encrypted environment-variable configuration.

---

# 2. Get the Telegram Chat ID

The bridge needs to know where to send the messages.

For a private Telegram chat, obtain the chat ID associated with the conversation where the bot will deliver the content.

Keep the chat ID in Vercel as an environment variable rather than hard-coding it into the application.

---

# 3. Environment Variables

The Telegram bridge requires three server-side variables, and the market
data gateway (see [Section 14](#14-market-data-api)) requires one more.

| Variable | Used by | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `api/telegram.js` | BotFather token |
| `TELEGRAM_CHAT_ID` | `api/telegram.js` | Destination Telegram chat |
| `BRIDGE_SECRET` | `api/telegram.js` | Shared secret authenticating callers |
| `MARKET_DATA_SECRET` | `api/market-data.js` | Shared secret authenticating callers of the market-data gateway |

Example:

```text
TELEGRAM_BOT_TOKEN=123456789:REDACTED
TELEGRAM_CHAT_ID=123456789
BRIDGE_SECRET=generate-a-long-random-secret
MARKET_DATA_SECRET=generate-a-different-long-random-secret
```

`MARKET_DATA_SECRET` is independent of `BRIDGE_SECRET` — use a distinct
random value, not the same one.

### Generating BRIDGE_SECRET

Use a cryptographically random value.

For example, locally:

```bash
openssl rand -hex 32
```

Do not use an easily guessed value such as:

```text
password123
telegram
binance
secret
```

---

# 4. Deploy to Vercel

## Option A — Vercel Dashboard

1. Open Vercel.
2. Select **Add New → Project**.
3. Import this GitHub repository.
4. Select:

```text
shegs-a/binance-square-analyst
```

5. Vercel should automatically detect the Node/Vercel project.
6. Add the following Production environment variables:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
BRIDGE_SECRET
```

7. Deploy.

After deployment, the endpoint will be:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/api/telegram
```

---

# 5. Test the Endpoint

The endpoint expects:

```http
POST /api/telegram
Content-Type: application/json
x-bridge-secret: YOUR_BRIDGE_SECRET
```

Example request:

```bash
curl -X POST \
  "https://YOUR-VERCEL-DOMAIN.vercel.app/api/telegram" \
  -H "Content-Type: application/json" \
  -H "x-bridge-secret: YOUR_BRIDGE_SECRET" \
  -d '{
    "text": "BTC Daily Market Analysis\n\nBias: Bullish above 105000.\n\nWatch for a liquidity sweep before confirmation."
  }'
```

Successful response:

```json
{
  "ok": true,
  "messages_sent": 1,
  "message_ids": [123]
}
```

---

# 6. Request Contract

### Endpoint

```text
POST /api/telegram
```

### Headers

```text
Content-Type: application/json
x-bridge-secret: <BRIDGE_SECRET>
```

### Body

```json
{
  "text": "Your Binance Square content pack here",
  "disable_web_page_preview": true
}
```

`disable_web_page_preview` is optional and defaults to `true`.

Set it to `false` if you want Telegram to generate previews for links.

---

# 7. Message Handling

Telegram has a maximum message length for normal text messages.

The bridge therefore splits long content automatically.

The splitting strategy is:

1. Try to split at a blank line.
2. If necessary, split at a normal newline.
3. If the message still cannot be split cleanly, use the hard character limit.

This is important for the Binance Square workflow because a complete daily analysis may contain:

- Market overview
- BTC analysis
- ETH analysis
- BNB analysis
- HTF bias
- 4H structure
- 1H structure
- 15M confirmation
- Invalidations
- Key levels
- Ready-to-post content

---

# 8. Why the Bridge Uses HTML Instead of MarkdownV2

The incoming content may be written in Markdown.

Telegram has its own MarkdownV2 syntax, which has many characters that require escaping.

Trying to automatically convert arbitrary Markdown into Telegram MarkdownV2 can create fragile messages.

This bridge therefore takes the safer approach:

```text
Incoming content
       ↓
Escape HTML-sensitive characters
       ↓
Send as Telegram HTML text
```

The content remains readable and safe.

If rich Telegram formatting is desired later, a dedicated Markdown → Telegram HTML converter can be added.

---

# 9. Security Model

The bridge uses two separate secrets/configuration values:

### Telegram Bot Token

```text
TELEGRAM_BOT_TOKEN
```

This authenticates the bridge to Telegram.

### Bridge Secret

```text
BRIDGE_SECRET
```

This authenticates the caller to the bridge.

Therefore:

```text
Caller
  │
  │ BRIDGE_SECRET
  ▼
Vercel Bridge
  │
  │ TELEGRAM_BOT_TOKEN
  ▼
Telegram
```

The caller never receives or needs the Telegram BotFather token.

---

# 10. Error Responses

### 401 — Unauthorized

The `x-bridge-secret` header is missing or incorrect.

```json
{
  "ok": false,
  "error": "Unauthorized"
}
```

### 400 — Invalid Request

The request does not contain a non-empty `text` field.

```json
{
  "ok": false,
  "error": "Request body must contain a non-empty \"text\" string."
}
```

### 500 — Configuration Error

One or more required Vercel environment variables are missing.

```json
{
  "ok": false,
  "error": "Telegram environment variables are not configured."
}
```

### 502 — Telegram Error

Telegram rejected the request or could not be reached.

The bridge returns a sanitized error response and logs diagnostic details server-side.

---

# 11. Local Development

No npm dependencies are required by the bridge itself.

If you want to test it locally using Vercel's CLI:

```bash
npm install -g vercel
```

Then:

```bash
vercel dev
```

The endpoint will normally be available at:

```text
http://localhost:3000/api/telegram
```

Configure local environment variables using Vercel's environment-variable workflow rather than committing secrets to Git.

---

# 12. Connecting the Binance Square Workflow

The intended production workflow is:

```text
09:00 Africa/Lagos
        │
        ▼
Retrieve fresh Binance public market data
        │
        ▼
BTC / ETH / BNB analysis
        │
        ▼
SMC structure analysis
        │
        ├── Daily
        ├── 4H
        ├── 1H
        └── 15M
        │
        ▼
Generate Binance Square content
        │
        ▼
POST content to this bridge
        │
        ▼
Private Telegram delivery
```

The bridge deliberately does **not** contain the market-analysis logic. This separation keeps the system easier to maintain.

---

# 13. Example Content Payload

```json
{
  "text": "# BTC Daily Analysis\n\nBTC remains bullish while price holds above the higher-timeframe demand zone.\n\n## 4H Structure\n\nA clean liquidity sweep followed by displacement would strengthen the long thesis.\n\n## Confirmation\n\nWait for a 15M CHOCH/BOS before considering an entry.\n\n## Invalidation\n\nThe bullish thesis is invalid if price accepts below the marked 4H swing low.\n\n$BTC",
  "disable_web_page_preview": true
}
```

The bridge will deliver the content to Telegram.

---

# 14. Market Data API

In addition to the Telegram delivery bridge, this repository exposes a
small, authenticated **Binance market-data gateway**. Its only job is to
fetch public Binance Spot OHLCV candle data and return it as clean JSON.

```text
ChatGPT
  │
  │ GET /api/market-data
  │ x-market-data-secret
  ▼
Vercel Serverless Function
api/market-data.js
  │
  │ public Spot klines (no API key)
  ▼
https://data-api.binance.vision/api/v3/klines
  │
  ▼
Normalized OHLCV JSON
  │
  ▼
ChatGPT performs SMC reasoning
```

**This endpoint does NOT perform technical analysis or make trading
decisions.** It does not compute market structure, BOS/CHOCH, order
blocks, fair value gaps, bias, or signals of any kind. It only retrieves
and normalizes raw Binance candle data — all SMC reasoning stays with the
calling workflow (ChatGPT).

### Endpoint

```text
GET /api/market-data
```

### Supported symbols

- `BTCUSDT`
- `ETHUSDT`
- `BNBUSDT`

### Supported intervals

- `1d`
- `4h`
- `1h`
- `15m`
- `5m`

### Query parameters

| Parameter | Required | Default | Notes |
|---|---|---|---|
| `symbol` | No | `BTCUSDT` | Case-insensitive; must be one of the supported symbols |
| `interval` | No | `4h` | Must be one of the supported intervals |
| `limit` | No | `100` | Integer from 1–500 |

### Authentication

```text
x-market-data-secret: <MARKET_DATA_SECRET>
```

Missing or incorrect credentials return `401 Unauthorized`.

### Example request

```bash
curl -s \
  "https://YOUR-VERCEL-DOMAIN.vercel.app/api/market-data?symbol=BTCUSDT&interval=4h&limit=100" \
  -H "x-market-data-secret: YOUR_MARKET_DATA_SECRET"
```

### Example response

```json
{
  "ok": true,
  "source": "binance",
  "symbol": "BTCUSDT",
  "interval": "4h",
  "limit": 100,
  "candles": [
    {
      "openTime": 1791134400000,
      "open": 84840.88,
      "high": 85112.65,
      "low": 84808.11,
      "close": 85106,
      "volume": 1234.56,
      "closeTime": 1791148799999
    }
  ],
  "candleStatus": {
    "lastCandle": "possibly_incomplete"
  },
  "lastCandle": {
    "openTime": 1791134400000,
    "closeTime": 1791148799999,
    "isClosed": false
  }
}
```

### Notes

- Candle ordering matches Binance's chronological order exactly — nothing
  is reordered, aggregated, or smoothed.
- The most recent candle is never dropped. `lastCandle.isClosed` tells the
  caller whether it may still be forming, based on comparing its
  `closeTime` to the current server time.
- No Binance API key is used or required — this uses Binance's public
  Spot market-data host (`data-api.binance.vision`).
- The upstream request has a bounded timeout so a slow/unresponsive
  Binance API cannot hang the function.

---

# 15. What This Repository Does NOT Do

This project currently does not:

- Execute trades
- Store Binance API credentials
- Store Telegram messages in a database
- Perform SMC analysis
- Scrape TradingView
- Publish directly to Binance Square
- Manage Binance user accounts
- Place Binance orders

It intentionally stays limited to two small, boring pieces:

1. A **secure Telegram delivery layer** (`api/telegram.js`).
2. A **secure, read-only Binance public market-data gateway**
   (`api/market-data.js`) that retrieves and normalizes OHLCV candles —
   nothing more.

All SMC reasoning, structure analysis, and trading decisions remain
outside this repository, in the calling workflow.

---

# 16. Future Extensions

Possible future versions can add:

### `/btc`

Request the latest BTC analysis.

### `/eth`

Request ETH analysis.

### `/bnb`

Request BNB analysis.

### `/posts`

Return the latest generated Binance Square content.

### `/refresh`

Trigger a fresh analysis.

### Message metadata

The bridge could later attach:

- Analysis timestamp
- Asset
- Timeframe
- Confidence
- Market regime
- Setup status

### Delivery routing

Future versions could support multiple destinations:

```text
Telegram
   ├── Personal chat
   ├── Private channel
   └── Team group
```

---

# 17. Operational Recommendation

For the first production version, keep this bridge deliberately boring.

The preferred architecture is:

```text
Analysis engine
       ↓
Authenticated HTTP request
       ↓
Vercel bridge
       ↓
Telegram
```

Do not put market logic, trading credentials, or unnecessary infrastructure into this repository until the delivery path is proven reliable.

Once the Telegram delivery works consistently, the next engineering step should be connecting the 9 AM Binance Square Analyst workflow to this endpoint.

---

## License

Private/personal project. Add an explicit license if this repository will later be made open source.
