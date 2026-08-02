/**
 * Resend API 経由のメール送信
 * 野島技研 2026-08-02 ／ HPまるごとおまかせ便 共通部品
 *
 * Cloudflare Workers は生のTCPソケットからのSMTP送信が
 * さくら側に拒否されるため（550 5.7.1 Command rejected）、
 * HTTPS の Resend API を使う。
 */

/** メールヘッダインジェクション対策：改行と制御文字を除去 */
export function sanitizeHeaderValue(str) {
  return String(str == null ? '' : str).replace(/[\r\n\t\0\x0B]+/g, ' ').trim();
}

/**
 * メールを1通送信する
 * @param {object} o
 * @param {string} o.apiKey    Resend APIキー
 * @param {string} o.from      差出人（例: 金山商事 <info@send.kny-s.co.jp>）
 * @param {string} o.to        宛先
 * @param {string} o.subject   件名
 * @param {string} o.text      本文（プレーンテキスト）
 * @param {string} [o.replyTo] 返信先
 */
export async function sendMail(o) {
  const payload = {
    from: o.from,
    to: [o.to],
    subject: o.subject,
    text: o.text,
  };
  if (o.replyTo) payload.reply_to = o.replyTo;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${o.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.message || j.name || JSON.stringify(j);
    } catch (_) {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`Resend ${res.status}: ${String(detail).slice(0, 200)}`);
  }
  const j = await res.json().catch(() => ({}));
  return j.id || true;
}
