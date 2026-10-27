/* 連絡先の組み立て（クローラー対策）／野島技研 2026-08-02 */
(function () {
  function join(a, b, c) { return a + '\u002D' + b + '\u002D' + c; }
  function apply() {
    var i, el, els;
    els = document.querySelectorAll('.tel-link');
    for (i = 0; i < els.length; i++) {
      el = els[i];
      var t = join(el.getAttribute('data-t1'), el.getAttribute('data-t2'), el.getAttribute('data-t3'));
      el.setAttribute('href', 'tel:' + t.replace(/\u002D/g, ''));
      var slot = el.querySelector('.tel-txt');
      if (!slot && el.textContent.indexOf('\u25CF') < 0 && !/\d/.test(el.textContent)) {
        el.appendChild(document.createTextNode(' ' + t));
      }
    }
    els = document.querySelectorAll('.tel-txt');
    for (i = 0; i < els.length; i++) {
      el = els[i];
      el.textContent = join(el.getAttribute('data-t1'), el.getAttribute('data-t2'), el.getAttribute('data-t3'));
    }
    els = document.querySelectorAll('.fax-txt');
    for (i = 0; i < els.length; i++) {
      el = els[i];
      el.textContent = join(el.getAttribute('data-f1'), el.getAttribute('data-f2'), el.getAttribute('data-f3'));
    }
    els = document.querySelectorAll('.mail-link');
    for (i = 0; i < els.length; i++) {
      el = els[i];
      var m = el.getAttribute('data-u') + '\u0040' + el.getAttribute('data-d');
      el.setAttribute('href', 'mail' + 'to:' + m);
      if (!/\u0040/.test(el.textContent)) el.textContent = m;
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else { apply(); }
})();
