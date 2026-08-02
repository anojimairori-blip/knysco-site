/**
 * Cloudflare Workers 用 最小SMTPクライアント
 * 野島技研 2026-08-02 ／ HPまるごとおまかせ便 共通部品
 *
 * Workers の cloudflare:sockets connect() を使う。
 * 465番の暗黙TLS（secureTransport:'on'）を既定とする。
 * 587番の STARTTLS は Workers 上で不安定という報告があるため既定にしない。
 */
import { connect } from 'cloudflare:sockets';

const CRLF = '\r\n';

/** RFC2047 準拠のヘッダエンコード（日本語をUTF-8 Base64で包む） */
export function encodeHeader(str) {
  if (/^[\x20-\x7E]*$/.test(str)) return str;
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  return `=?UTF-8?B?${b64}?=`;
}

/** 本文を Base64 に（行長76で折り返す） */
function encodeBody(str) {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  return (b64.match(/.{1,76}/g) || []).join(CRLF);
}

/** メールヘッダインジェクション対策：改行と制御文字を除去 */
export function sanitizeHeaderValue(str) {
  return String(str == null ? '' : str).replace(/[\r\n\t\0\x0B]+/g, ' ').trim();
}

class SmtpSession {
  constructor(socket) {
    this.socket = socket;
    this.writer = socket.writable.getWriter();
    this.reader = socket.readable.getReader();
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();
    this.buffer = '';
  }

  async readReply() {
    // SMTPは「NNN-」が継続行、「NNN 」が最終行
    for (let guard = 0; guard < 200; guard++) {
      const lines = this.buffer.split(CRLF).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) {
        const reply = this.buffer;
        this.buffer = '';
        return { code: parseInt(last.slice(0, 3), 10), text: reply.trim() };
      }
      const { value, done } = await this.reader.read();
      if (done) break;
      this.buffer += this.decoder.decode(value, { stream: true });
    }
    throw new Error('SMTP: 応答が取得できませんでした');
  }

  async send(line, expect) {
    await this.writer.write(this.encoder.encode(line + CRLF));
    const r = await this.readReply();
    if (expect && !expect.includes(r.code)) {
      throw new Error(`SMTP ${r.code}: ${r.text.slice(0, 160)}`);
    }
    return r;
  }

  async sendRaw(text) {
    await this.writer.write(this.encoder.encode(text));
  }

  async close() {
    try { await this.writer.close(); } catch (_) {}
    try { this.reader.releaseLock(); } catch (_) {}
    try { await this.socket.close(); } catch (_) {}
  }
}

/**
 * メールを1通送信する
 * @param {object} o
 * @param {string} o.host  SMTPホスト
 * @param {number} o.port  465（暗黙TLS）を推奨
 * @param {string} o.user  認証ユーザー名
 * @param {string} o.pass  認証パスワード
 * @param {string} o.fromEmail 差出人アドレス
 * @param {string} o.fromName  差出人表示名
 * @param {string} o.to        宛先
 * @param {string} o.subject   件名
 * @param {string} o.text      本文（プレーンテキスト）
 * @param {string} [o.replyTo] 返信先
 */
export async function sendMail(o) {
  const host = o.host;
  const port = Number(o.port || 465);
  const implicitTls = port === 465;

  const socket = connect(
    { hostname: host, port },
    implicitTls ? { secureTransport: 'on' } : { secureTransport: 'starttls' }
  );

  const s = new SmtpSession(socket);
  try {
    await socket.opened;

    const greet = await s.readReply();
    if (greet.code !== 220) throw new Error(`SMTP greeting ${greet.code}`);

    await s.send(`EHLO kny-s.co.jp`, [250]);

    if (!implicitTls) {
      await s.send('STARTTLS', [220]);
      const secure = socket.startTls();
      const s2 = new SmtpSession(secure);
      s.writer.releaseLock?.();
      Object.assign(s, s2);
      await s.send(`EHLO kny-s.co.jp`, [250]);
    }

    // AUTH LOGIN（さくらが確実に対応）
    await s.send('AUTH LOGIN', [334]);
    await s.send(btoa(o.user), [334]);
    await s.send(btoa(o.pass), [235]);

    await s.send(`MAIL FROM:<${o.fromEmail}>`, [250]);
    await s.send(`RCPT TO:<${o.to}>`, [250, 251]);
    await s.send('DATA', [354]);

    const headers = [
      `From: ${encodeHeader(o.fromName)} <${o.fromEmail}>`,
      `To: <${o.to}>`,
      o.replyTo ? `Reply-To: <${o.replyTo}>` : null,
      `Subject: ${encodeHeader(o.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@kny-s.co.jp>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      'X-Mailer: NojimaGiken-WorkerMail/1.0',
    ].filter(Boolean).join(CRLF);

    await s.sendRaw(headers + CRLF + CRLF + encodeBody(o.text) + CRLF + '.' + CRLF);
    const done = await s.readReply();
    if (done.code !== 250) throw new Error(`SMTP DATA ${done.code}: ${done.text.slice(0, 160)}`);

    try { await s.send('QUIT', [221]); } catch (_) {}
    return true;
  } finally {
    await s.close();
  }
}
