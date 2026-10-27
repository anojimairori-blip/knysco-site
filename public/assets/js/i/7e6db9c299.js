/* 入力補助 ／ 野島技研 2026-08-02
   ・全角英数記号 → 半角（メール・電話・郵便番号）
   ・電話番号のハイフン自動挿入
   ・郵便番号7桁 → 都県・市区町村を自動入力  */
(function () {
  var form = document.getElementById('contactForm');
  if (!form) return;

  /** 全角英数記号を半角に。長音・ダッシュ類はハイフンに寄せる */
  function toHalf(s) {
    return String(s)
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      })
      .replace(/[‐‑‒–—―ー−ｰ]/g, '-')
      .replace(/[＠]/g, '@').replace(/[．]/g, '.').replace(/[＿]/g, '_')
      .replace(/[－]/g, '-').replace(/[　]/g, ' ');
  }

  /** 日本の電話番号にハイフンを入れる（市外局番の桁数で分岐） */
  function formatTel(v) {
    var d = toHalf(v).replace(/[^0-9]/g, '');
    if (!d) return '';
    if (d.charAt(0) !== '0') return d;

    // フリーダイヤル・ナビダイヤル等（0120/0570/0800/0570）
    if (/^(0120|0800|0570|0990)/.test(d)) {
      if (d.length <= 4) return d;
      if (d.length <= 7) return d.slice(0, 4) + '-' + d.slice(4);
      return d.slice(0, 4) + '-' + d.slice(4, 7) + '-' + d.slice(7, 10);
    }
    // 携帯・IP電話（070/080/090/050）
    if (/^(070|080|090|050)/.test(d)) {
      if (d.length <= 3) return d;
      if (d.length <= 7) return d.slice(0, 3) + '-' + d.slice(3);
      return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7, 11);
    }
    // 2桁市外局番（東京03・大阪06）
    if (/^0(3|6)/.test(d)) {
      if (d.length <= 2) return d;
      if (d.length <= 6) return d.slice(0, 2) + '-' + d.slice(2);
      return d.slice(0, 2) + '-' + d.slice(2, 6) + '-' + d.slice(6, 10);
    }
    // 4桁市外局番（0480 など・埼玉北部/千葉/茨城に多い）
    var four = /^(01[3-9][0-9]|027[0-9]|028[0-9]|029[0-9]|0４|0４)/;
    if (/^(0[1-9][0-9]{2})/.test(d) && d.length >= 10 &&
        /^(0[2-9][0-9]{2})/.test(d) && isFourDigitArea(d)) {
      if (d.length <= 4) return d;
      if (d.length <= 6) return d.slice(0, 4) + '-' + d.slice(4);
      return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 10);
    }
    // 3桁市外局番（048/043/029 など。国内の大半）
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6, 10);
  }

  /* 対応エリアに実在する主な4桁市外局番のみ列挙（誤整形を避けるため限定） */
  var FOUR = ['0280','0291','0293','0294','0295','0296','0297','0299',
              '0276','0277','0278','0279','0282','0283','0284','0285','0287','0288','0289',
              '0422','0428','0436','0438','0439','0470','0475','0476','0478','0479',
              '0480','0493','0494','0495'];
  function isFourDigitArea(d) { return FOUR.indexOf(d.slice(0, 4)) >= 0; }

  /* ── 電話番号 ── */
  var tel = document.getElementById('fTel');
  if (tel) {
    tel.setAttribute('inputmode', 'tel');
    tel.addEventListener('input', function () {
      var before = this.value, atEnd = this.selectionStart === before.length;
      var after = formatTel(before);
      if (after !== before) {
        this.value = after;
        if (atEnd) this.setSelectionRange(after.length, after.length);
      }
    });
    tel.addEventListener('blur', function () { this.value = formatTel(this.value); });
  }

  /* ── メールアドレス ── */
  var mail = document.getElementById('fEmail');
  if (mail) {
    mail.setAttribute('inputmode', 'email');
    var fix = function () {
      var h = toHalf(this.value).replace(/\s/g, '');
      if (h !== this.value) this.value = h;
    };
    mail.addEventListener('blur', fix);
    mail.addEventListener('change', fix);
  }

  /* ── 郵便番号 → 住所 ── */
  var zip = document.getElementById('fZip');
  var pref = document.getElementById('fPref');
  var city = document.getElementById('fCity');
  var note = document.getElementById('zipNote');

  function showNote(type, msg) {
    if (!note) return;
    note.style.color = type === 'err' ? '#b91c1c' : 'var(--ink-mute)';
    note.textContent = msg;
    note.style.display = msg ? 'block' : 'none';
  }

  if (zip) {
    zip.setAttribute('inputmode', 'numeric');
    zip.addEventListener('input', function () {
      var d = toHalf(this.value).replace(/[^0-9]/g, '').slice(0, 7);
      this.value = d.length > 3 ? d.slice(0, 3) + '-' + d.slice(3) : d;
      if (d.length === 7) lookup(d);
      else showNote('', '');
    });
  }

  function lookup(d) {
    showNote('', '住所を調べています…');
    fetch('/api/zip?z=' + d)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.found) {
          var inArea = false;
          if (pref) {
            for (var i = 0; i < pref.options.length; i++) {
              if (pref.options[i].value === j.pref) { pref.selectedIndex = i; inArea = true; break; }
            }
            if (!inArea) pref.value = 'その他・未定';
          }
          if (city && !city.value) city.value = j.city;
          if (inArea) {
            showNote('', j.pref + ' ' + j.city + ' を入力しました。続きの番地をご記入ください。');
          } else {
            showNote('err', j.pref + ' ' + j.city + ' は通常の対応エリア外です。'
                   + 'ご相談は承りますので、そのまま送信してください。');
          }
        } else {
          if (pref) pref.value = 'その他・未定';
          showNote('err', '郵便番号が見つかりませんでした。お手数ですが都県と市区町村をご記入ください。');
        }
      })
      .catch(function () { showNote('', ''); });
  }
})();
