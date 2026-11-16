/* CSP の 'unsafe-inline' を外すための小さな係（2026-10-27）。
 *  - link[data-fx-css]：先読みしたスタイルを適用する（前の onload="this.rel='stylesheet'" の代わり）
 *  - data-fx-change="関数名"：変更で window の関数を呼ぶ（前の onchange）
 *  - data-fx-submit="関数名"：送信で関数を呼び、false が返ったら送信を止める（前の onsubmit="return …(event)"）
 *  - data-fx-stop：押しても親へ伝えない（前の onclick="event.stopPropagation()"）
 */
(function () {
  // 2026-11-02: すぐ rel=stylesheet にすると「描画を止めるスタイル」になり、最初の表示が遅れていた（井戸工房で約5秒）。
  // 先読みが届いた時（load）に当てる＝前の onload と同じ動き。取りこぼしはページの load で全部当てる。
  function on(l) { if (l.rel !== 'stylesheet') l.rel = 'stylesheet'; }
  function css() {
    var ls = document.querySelectorAll('link[data-fx-css]');
    for (var i = 0; i < ls.length; i++) on(ls[i]);
  }
  var pre = document.querySelectorAll('link[data-fx-css]');
  for (var j = 0; j < pre.length; j++) (function (l) { l.addEventListener('load', function () { on(l); }); })(pre[j]);
  window.addEventListener('load', css);
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
