# Market Data Routing

The analysis workflow supports multiple asset classes through a market-data adapter model.

## Routing contract

| User command | Market-data source | Example |
|---|---|---|
| `RUN BTCUSDT` | Binance integration | BTCUSDT |
| `RUN ETHUSDT` | Binance integration | ETHUSDT |
| `RUN BNBUSDT` | Binance integration | BNBUSDT |
| `RUN EURUSD` | Twelve Data integration | EUR/USD |
| `RUN GBPUSD` | Twelve Data integration | GBP/USD |
| `RUN GBPJPY` | Twelve Data integration | GBP/JPY |
| `RUN USDJPY` | Twelve Data integration | USD/JPY |
| `RUN XAUUSD` | Twelve Data integration | Gold / USD |
| `RUN XAGUSD` | Twelve Data integration | Silver / USD |
| `RUN Forex Majors` | Twelve Data integration | Major FX basket |

The exact Twelve Data symbol format should be resolved by the connected integration. For example, EURUSD is represented as EUR/USD in Twelve Data's forex universe.

## Analysis layer

The market-data source is an input adapter only. The SMC reasoning layer remains ChatGPT's contextual reasoning process.

For FX and metals, the normal analysis sequence is:

1. Daily
2. 4H
3. 1H
4. 15M

The analysis considers market structure, BOS/CHOCH, liquidity, displacement, order blocks, fair-value gaps when justified, premium/discount, retracement zones, invalidation and targets.

The system should not convert these concepts into a rigid deterministic SMC engine.

## Broker-feed principle

Twelve Data provides an aggregated market-data view rather than a broker-executable CFD quote. Forex and metals are decentralized markets, so prices can differ between providers and brokers.

That is acceptable for this workflow.

The output is **market intelligence and level discovery**, not an execution price. The trader can manually compare the generated levels against the relevant GFT, Deriv, or other MT5 broker feed before execution.

This means the workflow does not attempt to normalize every broker's CFD feed.

## Twelve Data integration requirement

The ChatGPT account/runtime used for this workflow must have the **Twelve Data integration/plugin connected**.

No Twelve Data API key is required in this repository when the connected ChatGPT integration is used directly.

Do not add Twelve Data credentials to:

- `outbox/latest.json`
- GitHub Actions secrets
- Vercel environment variables
- README files
- source code

unless a future server-side Twelve Data adapter is intentionally introduced.

## Example

```text
User:
RUN EURUSD

ChatGPT:
1. Resolve EURUSD -> EUR/USD
2. Fetch Twelve Data market data
3. Analyse Daily -> 4H -> 1H -> 15M
4. Produce SMC setup
5. Write outbox/latest.json
6. GitHub Actions delivers the content
```

For a basket request:

```text
RUN Forex Majors
```

ChatGPT should retrieve and analyse the configured major FX pairs through Twelve Data, then produce the requested content pack.

## Architectural model

```text
                    RUN SYMBOL
                        |
                        v
                Market Data Router
                   /          \
                  /            \
             Crypto           FX / Metals
                |                  |
                v                  v
            Binance          Twelve Data
                \                  /
                 \                /
                  v              v
                 ChatGPT SMC Brain
                        |
                        v
                  Analysis Output
                        |
                        v
                  GitHub Outbox
                        |
                        v
                 GitHub Actions
                        |
                        v
                 Vercel / Telegram
```

The important architectural boundary is:

> **Market-data source determines where the data comes from; it does not determine how the market is interpreted.**
