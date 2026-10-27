(function () {
  var PAGE = {
    "2":  "/company.html",     // 会社概要
    "13": "/contact.html",     // お問い合わせ
    "15": "/compliance.html",  // コンプライアンス
    "18": "/services.html",    // 不用品回収
    "20": "/household.html",   // 回収プラン 家庭系
    "22": "/office.html",      // 回収プラン 店舗・事務所・産廃
    "24": "/company.html",     // 会社の沿革
    "26": "/faq.html",         // FAQ
    "28": "/area.html",        // 回収エリア
    "30": "/permits.html"      // 許可一覧
  };
  var q = new URLSearchParams(location.search);
  var id = q.get("page_id");
  var dest = (id && PAGE[id]) ? PAGE[id] : "/";
  location.replace(dest);
})();
