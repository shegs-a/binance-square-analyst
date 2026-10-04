/**
 * Binance Square Analyst — Telegram Delivery Bridge
 *
 * This Vercel serverless function receives a content pack from an
 * authenticated caller and forwards it to a private Telegram chat.
 *
 * Why this bridge exists:
 *   The analysis/content-generation workflow should not need to know or
 *   store the Telegram BotFather token. Instead, this small service keeps
 *   the Telegram credentials in Vercel environment variables and exposes
 *   one authenticated HTTP endpoint.
 *
 * Endpoint:
 *   POST /api/telegram
 *
 * Required environment variables:
 *   TELEGRAM_BOT_TOKEN  - Telegram BotFather token (server-side secret)
 *   TELEGRAM_CHAT_ID    - Telegram destination chat ID
 *   BRIDGE_SECRET       - Shared secret used to authenticate callers
 *
 * Request headers:
 *   Content-Type: application/json
 *   x-bridge-secret: <BRIDGE_SECRET>
 *
 * Request body:
 *   {
 *     "text": "Your content pack here",
 *     "disable_web_page_preview": true
 *   }
 *
 * Notes:
 * - Telegram limits a normal message to 4096 characters.
 * - Messages are split automatically at sensible newline boundaries.
 * - We send escaped HTML rather than trying to parse arbitrary Markdown.
 *   This deliberately prioritizes reliable delivery over rich formatting.
 * - No credentials are accepted in the request body.
 */

/**
 * Escape arbitrary user/content text before placing it inside Telegram HTML.
 *
 * We intentionally escape all HTML-sensitive characters. This means the
 * incoming content is treated as text, not executable/formatting markup.
 */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Split a long message into chunks that Telegram can accept.
 *
 * Preference order:
 *   1. Paragraph boundary
 *   2. Newline boundary
 *   3. Hard character limit
 *
 * The small minimum cut guard prevents pathological behavior where a
 * message contains many very short lines.
 */
function splitMessage(text, maxLength = 4096) {
  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf('\n\n', maxLength);

    if (cut < 1000) {
      cut = remaining.lastIndexOf('\n', maxLength);
    }

    if (cut < 1000) {
      cut = maxLength;
    }

    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Read and validate the request body.
 *
 * Vercel's Node runtime normally gives us an already-parsed object for
 * application/json requests. The defensive fallback makes the function
 * tolerant of a raw string body as well.
 */
function getRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return null;
}

export default async function handler(req, res) {
  // This endpoint is intentionally write-only.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------
  //
  // The caller must know the shared BRIDGE_SECRET. The Telegram token is
  // never exposed to the caller and never accepted through the request.
  const bridgeSecret = process.env.BRIDGE_SECRET;

  if (
    !bridgeSecret ||
    req.headers['x-bridge-secret'] !== bridgeSecret
  ) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized'
    });
  }

  // -----------------------------------------------------------------------
  // Server-side Telegram configuration
  // -----------------------------------------------------------------------
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return res.status(500).json({
      ok: false,
      error: 'Telegram environment variables are not configured.'
    });
  }

  const body = getRequestBody(req);
  const text = body?.text;
  const disableWebPagePreview =
    body?.disable_web_page_preview !== false;

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'Request body must contain a non-empty "text" string.'
    });
  }

  // Telegram's Bot API endpoint is constructed entirely from the secret
  // stored on the server. It is never returned to the client.
  const telegramUrl =
    `https://api.telegram.org/bot${botToken}/sendMessage`;

  const chunks = splitMessage(text);
  const sentMessageIds = [];

  // Send sequentially so the Telegram post order exactly matches the
  // original content order.
  for (const chunk of chunks) {
    try {
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: escapeHtml(chunk),
          parse_mode: 'HTML',
          disable_web_page_preview: disableWebPagePreview
        })
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        console.error('Telegram API returned an error:', result);

        return res.status(502).json({
          ok: false,
          error: 'Telegram API error',
          details: result
        });
      }

      if (result.result?.message_id) {
        sentMessageIds.push(result.result.message_id);
      }
    } catch (error) {
      console.error('Failed to contact Telegram:', error);

      return res.status(502).json({
        ok: false,
        error: 'Unable to contact Telegram.'
      });
    }
  }

  return res.status(200).json({
    ok: true,
    messages_sent: sentMessageIds.length,
    message_ids: sentMessageIds
  });
}

