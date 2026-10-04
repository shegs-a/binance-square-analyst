# Binance Square Analyst

> An AI-driven market-analysis and content-delivery pipeline combining live Binance market data, discretionary SMC reasoning, GitHub automation, Vercel serverless infrastructure, and Telegram delivery.

![Architecture](https://img.shields.io/badge/Architecture-AI%20%2B%20Serverless%20%2B%20GitHub-blue)
![Vercel](https://img.shields.io/badge/Runtime-Vercel-black)
![GitHub Actions](https://img.shields.io/badge/Automation-GitHub%20Actions-2088FF)
![Telegram](https://img.shields.io/badge/Delivery-Telegram-26A5E4)
![Binance](https://img.shields.io/badge/Market%20Data-Binance-F0B90B)

## Overview

Binance Square Analyst is a production-oriented prototype for generating and delivering Binance Square market-analysis content.

The system deliberately separates responsibilities:

- **ChatGPT** — orchestration, market reasoning, and content generation.
- **Binance** — fresh public Spot market data.
- **SMC reasoning** — contextual multi-timeframe interpretation rather than a rigid indicator engine.
- **GitHub** — version-controlled outbox and event trigger.
- **GitHub Actions** — deterministic validation and delivery orchestration.
- **Vercel** — secure serverless Telegram bridge.
- **Telegram** — private delivery channel.

The result is a lightweight event-driven pipeline with no database, no trading execution, and no need to expose Telegram or trading credentials to the analysis layer.

---

# Production Architecture

The current validated workflow is:

    09:00 scheduled trigger
            |
            v
    ChatGPT reminder
            |
       user replies RUN
            |
            v
    ChatGPT normal runtime
            |
            +------> Binance integration
            |        fresh BTC/ETH/BNB candles
            |
            v
    Multi-timeframe SMC reasoning
       Daily -> 4H -> 1H -> 15M
            |
            v
    Binance Square content + metadata
            |
            v
    GitHub outbox/latest.json
            |
        git push
            |
            v
    GitHub Actions
            |
        HTTPS POST
            |
            v
    Vercel /api/telegram
            |
       Telegram Bot API
            |
            v
    Private Telegram chat

## Why the scheduled task is only a trigger

The daily scheduled task intentionally acts as a trigger rather than attempting to execute the entire workflow.

At 09:00 the user receives a reminder. Replying RUN moves execution into the normal ChatGPT runtime, where the connected Binance and GitHub capabilities can be used.

This creates a simple human-in-the-loop boundary:

    Scheduled automation
           |
          RUN
           |
    Normal AI runtime
           |
    Full production workflow

This is simpler, easier to inspect, and avoids turning a scheduled reminder into a hidden monolithic job.

---

# What has actually been proven

This repository is not just an architecture diagram. The critical production path has been exercised end-to-end.

## Live Binance data

The workflow successfully retrieved live Binance Spot OHLCV data for:

- BTCUSDT
- ETHUSDT
- BNBUSDT

using:

- 1D
- 4H
- 1H
- 15M

The production BTC analysis also accounted for incomplete candles rather than treating an in-progress candle as confirmed structure.

## SMC reasoning

The analysis layer successfully produced contextual market plans using:

- higher-timeframe structure;
- BOS / CHOCH concepts;
- liquidity sweeps;
- buy-side and sell-side liquidity;
- order-block context;
- fair-value-gap context where justified;
- displacement;
- premium / discount;
- retracement zones;
- lower-timeframe confirmation;
- invalidation;
- targets;
- anti-chasing logic.

The repository does not attempt to reduce all of this to a rigid algorithm.

The infrastructure supplies reliable data. The AI supplies contextual interpretation.

## Production content generation

A real production payload was generated and written to:

    outbox/latest.json

The payload contains both:

1. publication-ready content; and
2. structured metadata describing the analysis.

Representative metadata:

    {
      "asset": "BTCUSDT",
      "timeframe": "Daily+4H+1H+15M",
      "test": false,
      "live_binance_data": true,
      "analysis": {
        "bias": "bullish",
        "primary_setup": "long_retest",
        "long_retest_zone": "85100-85250",
        "buy_side_liquidity": "85428-85470"
      }
    }

## GitHub Actions delivery

The repository contains:

    .github/workflows/deliver-square-content.yml

The workflow:

1. triggers when outbox/latest.json changes;
2. checks out the repository;
3. validates that a non-empty text payload exists;
4. reads the payload safely with jq;
5. loads the bridge secret from GitHub Actions Secrets;
6. POSTs the content to Vercel;
7. fails if delivery fails.

It also supports manual workflow_dispatch execution.

## Vercel to Telegram

The Vercel bridge was tested independently and as part of the complete production flow.

It successfully:

- authenticates callers with a shared secret;
- keeps the Telegram BotFather token server-side;
- validates incoming content;
- escapes HTML-sensitive characters;
- splits long Telegram messages;
- preserves message order;
- calls the Telegram Bot API;
- returns message IDs;
- reports failures cleanly.

## End-to-end production test

A complete production SMC content-generation run successfully traversed:

    Live Binance data
          |
    ChatGPT SMC analysis
          |
    Production Square content
          |
    GitHub outbox
          |
    GitHub Actions
          |
    Vercel
          |
    Telegram

Validated production workflow:

- Workflow: Deliver Square Content to Telegram
- Run: #5
- Run ID: 37226908842
- Commit: 41189ea8fd9cb865d9a8c9e93a17e5ec6b2aa540
- Result: success

Earlier runs independently validated the GitHub -> Actions -> Vercel -> Telegram delivery path before the live SMC production test.

---

# Repository Structure

    binance-square-analyst/
    |
    +-- .github/
    |   +-- workflows/
    |       +-- deliver-square-content.yml
    |
    +-- api/
    |   +-- telegram.js
    |   +-- market-data.js
    |
    +-- test/
    |   +-- market-data.test.mjs
    |
    +-- outbox/
    |   +-- latest.json
    |
    +-- package.json
    +-- README.md

### Key files

| File | Responsibility |
|---|---|
| api/telegram.js | Secure Vercel -> Telegram delivery bridge |
| api/market-data.js | Optional authenticated Binance OHLCV gateway |
| outbox/latest.json | Latest generated content and analysis metadata |
| .github/workflows/deliver-square-content.yml | Automated outbox validation and delivery |
| test/market-data.test.mjs | Lightweight market-data gateway tests |
| package.json | Minimal Node/Vercel project metadata |

---

# Technology Stack

| Layer | Technology | Responsibility |
|---|---|---|
| AI orchestration | ChatGPT | Workflow orchestration, reasoning, content generation |
| Market data | Binance public Spot data | Live OHLCV candles |
| Analysis | SMC reasoning | Market structure and setup interpretation |
| Version control | Git / GitHub | Source control and content outbox |
| CI/CD | GitHub Actions | Validation and delivery |
| Serverless | Vercel | Secure Telegram bridge |
| Messaging | Telegram Bot API | Private content delivery |
| Runtime | Node.js 20+ | Serverless functions |
| Data format | JSON | Machine-readable content contract |
| Testing | Node.js test runner | Lightweight gateway validation |

---

# Key Engineering Decisions

## 1. AI reasoning is separated from infrastructure

The project intentionally avoids turning SMC into a giant collection of hard-coded conditions.

Instead of:

    condition A + condition B + condition C = bullish

the system uses:

    Reliable market data
           |
       AI reasoning
           |
    Structured conclusion
           |
    Deterministic delivery

This preserves contextual reasoning while keeping the infrastructure predictable.

## 2. No trading execution

This project is read-only from a trading perspective.

It does not:

- place orders;
- modify positions;
- withdraw funds;
- access trading account balances;
- store Binance trading credentials;
- manage a Binance account.

The project is an analysis and publishing workflow, not a trading bot.

## 3. Secrets stay outside the repository

Production secrets are stored in platform secret stores.

Vercel environment variables:

- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
- BRIDGE_SECRET
- MARKET_DATA_SECRET

GitHub Actions secret:

- VERCEL_BRIDGE_SECRET

No secret values belong in source control, request bodies, screenshots, or documentation.

## 4. Remove infrastructure when it stops adding value

A Vercel market-data gateway was initially useful during architecture exploration.

Once direct Binance access from the ChatGPT runtime was proven reliable, the gateway was removed from the critical production path.

The gateway remains available as an optional infrastructure component.

This follows an important production principle:

> Do not keep a service in the critical path simply because you already built it.

## 5. Keep reasoning and delivery loosely coupled

The analysis layer does not need to know how Telegram works.

The Telegram bridge does not need to know how the analysis was produced.

The integration contract is intentionally small:

    {
      "text": "..."
    }

This makes each component replaceable.

---

# The GitHub Outbox Pattern

The repository uses a version-controlled outbox:

    AI-generated content
            |
            v
    outbox/latest.json
            |
            v
        Git commit
            |
            v
    GitHub push event
            |
            v
    GitHub Actions
            |
            v
    External delivery

This provides:

### Auditability

Every generated payload can be associated with a Git commit.

### Reproducibility

The exact payload that triggered delivery is preserved in repository history.

### Loose coupling

The AI generation layer does not need to know how Telegram works.

### Failure visibility

A failed delivery becomes a visible GitHub Actions failure rather than a silent background error.

### Extensibility

The same outbox can later feed Telegram, Slack, email, a dashboard, or an analytics pipeline.

---

# Telegram Bridge

## Endpoint

    POST /api/telegram

Production endpoint:

    https://binance-square-analyst.vercel.app/api/telegram

## Authentication

    Content-Type: application/json
    x-bridge-secret: <BRIDGE_SECRET>

## Request

    {
      "text": "Your generated Binance Square content",
      "disable_web_page_preview": true
    }

## Successful response

    {
      "ok": true,
      "messages_sent": 1,
      "message_ids": [123]
    }

## Error model

| Status | Meaning |
|---|---|
| 401 | Missing or invalid bridge secret |
| 400 | Invalid or empty content payload |
| 500 | Missing Telegram server configuration |
| 502 | Telegram API or network failure |

---

# Telegram Message Safety

Telegram has a maximum length for normal text messages.

The bridge automatically splits long messages using this priority:

1. paragraph boundary;
2. newline boundary;
3. hard character limit.

Messages are sent sequentially so multi-part content arrives in the correct order.

Incoming content is HTML-escaped before being sent using Telegram HTML parse mode. This treats the incoming content as text and avoids fragile MarkdownV2 parsing.

---

# GitHub Actions

The delivery workflow is intentionally small.

    on:
      push:
        paths:
          - "outbox/latest.json"
      workflow_dispatch:

The pipeline is:

    outbox/latest.json changes
              |
       GitHub Actions
              |
       validate .text
              |
       read secret
              |
       POST to Vercel
              |
       Vercel validates
              |
       Telegram Bot API

The workflow requests only repository read permission:

    permissions:
      contents: read

This keeps the delivery job narrowly scoped.

---

# Market Data Gateway

The repository also contains:

    api/market-data.js

This is an authenticated, read-only Binance Spot OHLCV gateway.

### Supported symbols

- BTCUSDT
- ETHUSDT
- BNBUSDT

### Supported intervals

- 1d
- 4h
- 1h
- 15m
- 5m

### Query parameters

| Parameter | Default | Description |
|---|---|---|
| symbol | BTCUSDT | Supported Spot symbol |
| interval | 4h | Supported candle interval |
| limit | 100 | 1-500 candles |

The gateway normalizes Binance kline responses into explicit OHLCV objects and reports whether the latest candle is still forming.

### Production status

This endpoint is **not required by the current validated live analysis path**.

The current workflow obtains Binance market data directly through the connected Binance integration in the ChatGPT runtime.

Keeping the gateway available nevertheless provides a reusable server-side market-data abstraction for future clients or services.

---

# Example Production Analysis

A representative live BTC setup generated by the workflow included:

    BTCUSDT — Daily + 4H + 1H + 15M

    Bias:
    BULLISH

    Primary setup:
    LONG RETEST

    Long retest zone:
    $85,100-$85,250

    Buy-side liquidity:
    $85,428-$85,470

    Targets:
    $85,470
    $85,650
    $86,000+

    Invalidation:
    Sustained loss of ~$85,033
    Stronger invalidation below ~$84,558

The generated content also explicitly identified when price was extended into liquidity and advised against blindly chasing the move.

The goal is therefore to produce **conditional market plans**, not sensationalized "BUY NOW" calls.

---

# What the Project Does

- Fetches fresh public Binance market data.
- Performs multi-timeframe SMC analysis through the AI reasoning layer.
- Generates Binance Square-ready commentary.
- Produces structured analysis metadata.
- Writes the generated payload to GitHub.
- Uses Git history as an auditable outbox.
- Automatically validates the outbox.
- Delivers content through GitHub Actions.
- Uses Vercel as a secure serverless delivery boundary.
- Sends content to a private Telegram chat.
- Handles Telegram message length limits.
- Keeps credentials in secret stores.
- Provides an optional reusable market-data gateway.

# What the Project Does NOT Do

This project intentionally does not:

- execute cryptocurrency trades;
- place Binance orders;
- manage Binance trading accounts;
- store Binance trading API keys;
- withdraw funds;
- perform autonomous portfolio management;
- scrape private Binance account data;
- publish directly to Binance Square;
- replace contextual SMC reasoning with a rigid indicator engine;
- require a database;
- require an always-on server.

---

# Failure Handling

Failures occur at explicit boundaries.

### Market-data failure

The analysis workflow should stop rather than fabricate market information.

### Invalid outbox

GitHub Actions fails validation if outbox/latest.json is missing or does not contain a non-empty text field.

### Missing bridge secret

The workflow fails before attempting delivery.

### Unauthorized caller

Vercel returns a 401 response.

### Telegram failure

Vercel returns a 502 response and GitHub Actions fails the delivery job.

This creates an important operational property:

> A failed delivery is visible as a failed workflow rather than being silently ignored.

---

# Testing Philosophy

Testing follows the architecture.

## Layer 1 — Function validation

Validate request handling, market-data normalization, authentication and error conditions.

## Layer 2 — Delivery validation

Verify:

    GitHub
      -> GitHub Actions
      -> Vercel
      -> Telegram

## Layer 3 — Production workflow validation

Verify:

    Live Binance data
      -> AI SMC reasoning
      -> production content
      -> GitHub outbox
      -> GitHub Actions
      -> Vercel
      -> Telegram

The third layer is the strongest proof because it validates the complete system rather than isolated components.

---

# Engineering Lessons

## 1. Start with the actual constraint

The initial design assumed the scheduled environment could execute the complete workflow.

Testing showed that scheduled and normal ChatGPT runtimes do not expose identical integrations.

The architecture adapted:

    Scheduled task
         |
       trigger
         |
    Normal runtime
         |
    Full workflow

The result is simpler and more reliable than forcing every capability into one execution context.

## 2. Prefer deterministic boundaries around AI

AI systems are probabilistic.

The surrounding infrastructure should be deterministic.

    Probabilistic
    -------------
    Market interpretation
    Content generation

    Deterministic
    -------------
    JSON contract
    Git commit
    Workflow trigger
    Secret validation
    HTTP delivery
    Telegram API

This separation makes AI-powered systems easier to operate.

## 3. Keep the critical path small

The production path does not need a database, message queue, dedicated backend server, or custom market-data service.

The current system is intentionally small:

    ChatGPT
      -> GitHub
      -> GitHub Actions
      -> Vercel
      -> Telegram

Minimal infrastructure means fewer failure points.

## 4. Version control can also be an event mechanism

GitHub is simultaneously:

- source control;
- audit log;
- content outbox;
- workflow trigger.

That is a useful pattern for lightweight event-driven automation.

---

# Future Roadmap

## Phase 2 — Multi-asset production runs

Generate a single daily content pack covering:

- BTCUSDT
- ETHUSDT
- BNBUSDT

with independent SMC analysis for each asset.

## Phase 3 — Content variants

Generate:

- short market updates;
- full SMC analyses;
- setup alerts;
- educational posts;
- weekly market recaps.

## Phase 4 — Delivery adapters

Add additional destinations:

    AI Outbox
       |
       +-- Telegram
       +-- Slack
       +-- Email
       +-- Web dashboard
       +-- Content archive

## Phase 5 — Observability

Potential additions:

- delivery IDs;
- structured logs;
- latency measurements;
- failure dashboards;
- content-generation history;
- delivery retry policies.

## Phase 6 — Binance Square publishing

If direct publishing is introduced, it should remain a separate delivery adapter rather than being tightly coupled to the SMC reasoning layer.

---

# Portfolio Perspective

This repository demonstrates more than a Telegram bot.

It demonstrates the design and integration of an **AI-assisted production workflow across multiple systems**.

### AI / Reasoning

- multi-timeframe analysis;
- contextual SMC reasoning;
- structured decision generation;
- human-in-the-loop orchestration.

### Backend Engineering

- serverless API design;
- request validation;
- authentication;
- secret management;
- external API integration;
- failure handling.

### DevOps

- GitHub Actions;
- event-driven automation;
- CI/CD;
- Vercel deployment;
- environment secrets;
- explicit operational boundaries.

### Integration Architecture

    Binance -> AI
    AI -> GitHub
    GitHub -> GitHub Actions
    GitHub Actions -> Vercel
    Vercel -> Telegram

### Software Architecture

- loose coupling;
- deterministic interfaces;
- outbox pattern;
- separation of concerns;
- minimal infrastructure;
- graceful failure handling.

The project is intentionally small enough to understand quickly while still demonstrating a complete path from **live data -> AI reasoning -> production delivery**.

---

# Quick Architecture Summary

    +-----------------------+
    | Scheduled Trigger     |
    | 09:00                  |
    +-----------+-----------+
                |
               RUN
                |
    +-----------v-----------+
    | ChatGPT Orchestrator  |
    +-----------+-----------+
                |
        +-------+-------+
        |               |
        v               v
     Binance       SMC Reasoning
     live data      Daily/4H/1H/15M
        |               |
        +-------+-------+
                |
                v
    +-----------------------+
    | Square Content        |
    | + Analysis Metadata   |
    +-----------+-----------+
                |
                v
    +-----------------------+
    | GitHub Outbox         |
    | outbox/latest.json    |
    +-----------+-----------+
                |
              push
                |
                v
    +-----------------------+
    | GitHub Actions        |
    +-----------+-----------+
                |
              HTTPS
                |
                v
    +-----------------------+
    | Vercel Telegram Bridge|
    +-----------+-----------+
                |
             Bot API
                |
                v
    +-----------------------+
    | Private Telegram      |
    +-----------------------+

---

# Status

**Current status: Production-proven prototype.**

The core workflow has been successfully exercised with live Binance data and real Telegram delivery.

The system is ready to evolve from a validated experiment into a more complete automated Binance Square content platform.

---

## Disclaimer

This project is an engineering and market-analysis experiment.

Generated market commentary is educational and is **not financial advice**.

No part of this repository executes trades or manages funds.

---

## License

Private/personal project.

If this repository is later released as open source, add an explicit license appropriate to the intended use.
