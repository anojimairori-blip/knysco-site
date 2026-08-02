/**
 * 金山商事 公式サイト Worker
 * 野島技研 2026-08-02
 *
 * ・/api/contact  … お問い合わせフォームの受付（POST）
 * ・それ以外       … 静的アセットをそのまま配信
 */
import { sendMail, sanitizeHeaderValue } from './mailer-resend.js';

const ALLOWED_ORIGINS = ['https://kny-s.co.jp', 'https://www.kny-s.co.jp'];

const MIN_ELAPSED_SEC = 3;
const MAX_ELAPSED_SEC = 86400;
const RATE_WINDOW_SEC = 300;
const RATE_MAX = 3;

function corsHeaders(origin) {
  const h = {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };
  if (ALLOWED_ORIGINS.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Vary'] = 'Origin';
  }
  return h;
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders(origin) });
}

/** Workers KV を使わない簡易レート制限（Cache API を利用） */
async function rateLimited(ip) {
  const key = new Request(`https://ratelimit.internal/${encodeURIComponent(ip)}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  let hits = [];
  if (hit) {
    try { hits = await hit.json(); } catch (_) { hits = []; }
  }
  const now = Math.floor(Date.now() / 1000);
  hits = hits.filter((t) => now - t < RATE_WINDOW_SEC);
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  await cache.put(
    key,
    new Response(JSON.stringify(hits), {
      headers: { 'Cache-Control': `max-age=${RATE_WINDOW_SEC}`, 'Content-Type': 'application/json' },
    })
  );
  return false;
}

function val(form, key, max = 200) {
  const all = form.getAll(key);
  let v = all.length > 1 ? all.join('、') : (all[0] ?? '');
  v = String(v);
  return v.length > max ? v.slice(0, max) : v;
}

async function handleContact(request, env) {
  const origin = request.headers.get('Origin') || '';

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(origin),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'POST') return json({ success: false, message: 'Method Not Allowed' }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ success: false, message: '不正なリクエストです。' }, 403, origin);
  }

  let form;
  try {
    form = await request.formData();
  } catch (_) {
    return json({ success: false, message: '送信データを読み取れませんでした。' }, 400, origin);
  }

  // 対策1: ハニーポット（ボットには成功を装って静かに破棄）
  if (val(form, 'website').trim() !== '' || val(form, 'botcheck').trim() !== '') {
    return json({ success: true, message: '送信しました。' }, 200, origin);
  }

  // 対策2: 送信までの経過時間
  const ts = parseInt(val(form, 'form_ts'), 10) || 0;
  const elapsed = Math.floor(Date.now() / 1000) - Math.floor(ts / 1000);
  if (ts <= 0 || elapsed < MIN_ELAPSED_SEC) {
    return json({ success: false, message: '送信が早すぎます。少し時間をおいてお試しください。' }, 429, origin);
  }
  if (elapsed > MAX_ELAPSED_SEC) {
    return json({ success: false, message: 'ページを開いてから時間が経過しています。画面を再読み込みしてお試しください。' }, 400, origin);
  }

  // 対策3: Turnstile（サイトキー設定時のみ）
  if (env.TURNSTILE_SECRET) {
    const token = val(form, 'cf-turnstile-response', 4000);
    if (!token) return json({ success: false, message: '認証が完了していません。' }, 400, origin);
    const body = new FormData();
    body.append('secret', env.TURNSTILE_SECRET);
    body.append('response', token);
    body.append('remoteip', request.headers.get('CF-Connecting-IP') || '');
    const vr = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const vj = await vr.json().catch(() => ({}));
    if (!vj.success) return json({ success: false, message: '認証に失敗しました。画面を再読み込みしてお試しください。' }, 403, origin);
  }

  // 対策4: レート制限
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  if (await rateLimited(ip)) {
    return json({ success: false, message: '送信回数の上限に達しました。しばらく時間をおいてお試しください。' }, 429, origin);
  }

  // 入力の取得
  const f = {
    category: sanitizeHeaderValue(val(form, 'category', 60)),
    customer: sanitizeHeaderValue(val(form, 'customer_type', 20)),
    company: sanitizeHeaderValue(val(form, 'company', 100)),
    name: sanitizeHeaderValue(val(form, 'name', 60)),
    tel: sanitizeHeaderValue(val(form, 'tel', 30)),
    email: sanitizeHeaderValue(val(form, 'email', 120)),
    pref: sanitizeHeaderValue(val(form, 'pref', 20)),
    city: sanitizeHeaderValue(val(form, 'city', 100)),
    waste: sanitizeHeaderValue(val(form, 'waste_type[]', 300)) || sanitizeHeaderValue(val(form, 'waste_type', 300)),
    amount: sanitizeHeaderValue(val(form, 'amount', 40)),
    access: sanitizeHeaderValue(val(form, 'access', 60)),
    parking: sanitizeHeaderValue(val(form, 'parking', 60)),
    timing: sanitizeHeaderValue(val(form, 'timing', 40)),
    manifest: sanitizeHeaderValue(val(form, 'manifest', 30)),
    message: val(form, 'message', 4000).replace(/[\0\x0B]/g, '').trim(),
  };

  const missing = [];
  if (!f.category) missing.push('お問い合わせ種別');
  if (!f.customer) missing.push('お客様種別');
  if (!f.name) missing.push('ご担当者名');
  if (!f.tel) missing.push('電話番号');
  if (!f.email) missing.push('メールアドレス');
  if (!f.pref) missing.push('作業場所');
  if (missing.length) {
    return json({ success: false, message: '未入力の項目があります：' + missing.join('、') }, 400, origin);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
    return json({ success: false, message: 'メールアドレスの形式をご確認ください。' }, 400, origin);
  }
  if (!/^[0-9\-+()\s]{9,20}$/.test(f.tel)) {
    return json({ success: false, message: '電話番号の形式をご確認ください。' }, 400, origin);
  }
  if ((f.message.match(/https?:\/\//gi) || []).length >= 3) {
    return json({ success: false, message: '送信できませんでした。お手数ですがお電話にてご連絡ください。' }, 400, origin);
  }

  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const recvNo = `${p(now.getUTCFullYear() % 100)}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
  const stamp = `${now.getUTCFullYear()}年${now.getUTCMonth() + 1}月${now.getUTCDate()}日 ${p(now.getUTCHours())}:${p(now.getUTCMinutes())}`;
  const line = '─'.repeat(30);
  const or = (v) => (v ? v : '（未入力）');

  const body = [
    '金山商事株式会社 公式サイトのお問い合わせフォームから送信がありました。',
    '',
    `受付番号　　　　： ${recvNo}`,
    `受信日時　　　　： ${stamp}`,
    line,
    `お問い合わせ種別： ${f.category}`,
    `お客様種別　　　： ${f.customer}`,
    `会社名・組織名　： ${or(f.company)}`,
    `ご担当者名　　　： ${f.name}`,
    `電話番号　　　　： ${f.tel}`,
    `メールアドレス　： ${f.email}`,
    `作業場所　　　　： ${f.pref} ${f.city}`,
    line,
    `廃棄物の種類　　： ${or(f.waste)}`,
    `おおよその数量　： ${or(f.amount)}`,
    `作業場所の状況　： ${or(f.access)}`,
    `駐車スペース　　： ${or(f.parking)}`,
    `ご希望時期　　　： ${or(f.timing)}`,
    `マニフェスト　　： ${or(f.manifest)}`,
    line,
    'ご相談内容：',
    or(f.message),
    '',
    line,
    `送信元IP： ${ip}`,
    '',
    `このメールに返信すると、お客様（${f.email}）へ直接返信できます。`,
  ].join('\n');

  const mailCfg = {
    apiKey: env.RESEND_API_KEY,
    from: `${env.MAIL_FROM_NAME} <${env.MAIL_FROM}>`,
  };

  try {
    await sendMail({
      ...mailCfg,
      to: env.MAIL_TO,
      replyTo: f.email,
      subject: `【HPお問い合わせ】${f.category}／${f.name} 様（${recvNo}）`,
      text: body,
    });
  } catch (err) {
    console.error('mail error', err && err.message);
    return json({ success: false, message: '送信処理でエラーが発生しました。お手数ですがお電話にてご連絡ください。' }, 500, origin);
  }

  // 自動返信（失敗しても本体の受付は成功扱い）
  if (env.AUTO_REPLY === '1') {
    const reply = [
      `${f.name} 様`,
      '',
      'このたびは金山商事株式会社へお問い合わせいただき、誠にありがとうございます。',
      '下記の内容で受け付けいたしました。担当者より折り返しご連絡いたします。',
      '',
      `受付番号： ${recvNo}`,
      line,
      `お問い合わせ種別： ${f.category}`,
      `作業場所　　　　： ${f.pref} ${f.city}`,
      `お電話番号　　　： ${f.tel}`,
      '',
      'ご相談内容：',
      or(f.message),
      line,
      '',
      'お急ぎの場合は、お電話にてご連絡ください。',
      `TEL ${env.TEL_DISPLAY}（平日 9:00〜18:00）`,
      '',
      '※ このメールは自動返信です。',
      '',
      '─────────────────────────',
      '金山商事株式会社',
      '産業廃棄物 収集運搬・処分業 ／ 不用品回収',
      `TEL ${env.TEL_DISPLAY}　FAX ${env.FAX_DISPLAY}`,
      'https://kny-s.co.jp/',
      '─────────────────────────',
    ].join('\n');
    try {
      await sendMail({
        ...mailCfg,
        to: f.email,
        subject: `【金山商事】お問い合わせを受け付けました（${recvNo}）`,
        text: reply,
      });
    } catch (err) {
      console.error('autoreply error', err && err.message);
    }
  }

  return json(
    { success: true, message: 'お問い合わせを受け付けました。担当者より折り返しご連絡いたします。', recvNo },
    200,
    origin
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact') {
      return handleContact(request, env);
    }
    // 疎通確認用（メールは送らない）
    if (url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({ ok: true, from: env.MAIL_FROM, to: env.MAIL_TO, hasKey: !!env.RESEND_API_KEY }),
        { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      );
    }
    return env.ASSETS.fetch(request);
  },
};
