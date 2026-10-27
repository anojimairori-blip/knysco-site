/* CSP の 'unsafe-inline' を外すための小さな係（2026-10-27）。
 *  - link[data-fx-css]：先読みしたスタイルを適用する（前の onload="this.rel='stylesheet'" の代わり）
 *  - data-fx-change="関数名"：変更で window の関数を呼ぶ（前の onchange）
 *  - data-fx-submit="関数名"：送信で関数を呼び、false が返ったら送信を止める（前の onsubmit="return …(event)"）
 *  - data-fx-stop：押しても親へ伝えない（前の onclick="event.stopPropagation()"）
 */
(function () {
  function css() {
    var ls = document.querySelectorAll('link[data-fx-css]');
    for (var i = 0; i < ls.length; i++) ls[i].rel = 'stylesheet';
  }
  css();
  document.addEventListener('DOMContentLoaded', css);
  document.addEventListener('change', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-fx-change]') : null;
    if (!t) return;
    var fn = window[t.getAttribute('data-fx-change')];
    if (typeof fn === 'function') fn.call(t, e);
  });
  document.addEventListener('submit', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute || !t.getAttribute('data-fx-submit')) return;
    var fn = window[t.getAttribute('data-fx-submit')];
    if (typeof fn === 'function' && fn.call(t, e) === false) e.preventDefault();
  });
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-fx-stop]') : null;
    if (t) e.stopPropagation();
  }, true);
})();
