(function () {
  var form = document.getElementById('contactForm');
  if (!form) return;

  var msgBox   = document.getElementById('formMsg');
  var btn      = document.getElementById('submitBtn');
  var tsField  = document.getElementById('formTs');
  var tsBox    = document.getElementById('turnstileBox');

  // ページ表示時刻を記録（送信が早すぎる自動投稿を弾くため）
  if (tsField) tsField.value = String(Date.now());

  // Turnstile はサイトキーを設定したときだけ表示・読み込みする
  var tsEl = tsBox ? tsBox.querySelector('.cf-turnstile') : null;
  if (tsEl && tsEl.getAttribute('data-sitekey').indexOf('YOUR_') !== 0) {
    tsBox.style.display = 'block';
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }

  function show(type, html) {
    if (!msgBox) return;
    var style = {
      ok:   'background:#e8f5ec; border-left:5px solid var(--green-deep); color:var(--ink);',
      err:  'background:#fdecea; border-left:5px solid #b91c1c; color:#7f1d1d;',
      wait: 'background:#fff6e5; border-left:5px solid var(--gold); color:var(--ink);'
    }[type];
    msgBox.style.cssText = 'margin:20px 0; padding:16px 20px; border-radius:10px; font-size:14px; line-height:1.9;' + style;
    msgBox.innerHTML = html;
    msgBox.style.display = 'block';
    msgBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  var D = '\u002D';
  var TEL = '048' + D + '281' + D + '7191', FAX = '048' + D + '286' + D + '2891';
  function fallback() {
    return '恐れ入りますが、お電話 <strong>' + TEL + '</strong>（平日9:00〜18:00）または FAX <strong>' + FAX + '</strong> にてご連絡ください。';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // 必須項目の確認（ブラウザ標準の検証を使いつつ、最初のエラー箇所へ移動）
    if (!form.checkValidity()) {
      var bad = form.querySelector(':invalid');
      if (bad) { bad.focus(); bad.reportValidity && bad.reportValidity(); }
      show('err', '未入力の項目があります。<span class="required">*</span> 印の項目をご確認ください。');
      return;
    }

    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = '送信中…';
    show('wait', '送信しています。しばらくお待ちください。');

    fetch(form.action, { method: 'POST', body: new FormData(form) })
      .then(function (res) {
        return res.json().catch(function () { return { success: res.ok, message: '' }; })
          .then(function (data) { return { status: res.status, data: data }; });
      })
      .then(function (r) {
        if (r.data && r.data.success) {
          form.style.display = 'none';
          var box = document.getElementById('detailBox');
          if (box) box.style.display = 'none';
          show('ok',
            '<strong>お問い合わせを受け付けました。</strong><br>' +
            'ご入力のメールアドレス宛に、受付確認のメールをお送りしました。<br>' +
            '担当者より原則2営業日以内にご返信いたします。<br>' +
            'お急ぎの場合はお電話（<strong>' + TEL + '</strong>）でもご相談を承ります。');
        } else {
          var m = (r.data && r.data.message) ? r.data.message : '送信に失敗しました。';
          show('err', m + '<br>' + fallback());
          btn.disabled = false; btn.textContent = label;
          if (window.turnstile) { try { window.turnstile.reset(); } catch (err) {} }
        }
      })
      .catch(function () {
        show('err', '通信エラーが発生しました。<br>' + fallback());
        btn.disabled = false; btn.textContent = label;
      });
  });
})();
