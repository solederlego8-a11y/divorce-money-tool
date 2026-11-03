/*
* 養育費／婚姻費用シミュレーター共通UI
* 入力項目と子の生活費指数（0〜14歳=62、15歳以上=85）は仕様書v0.2 §2-1に基づく。
*
* 算定データの取得状況（2026-11-03更新、詳細は assets/santei-data.js、
* assets/santei-tables.js と README）：
* - 生活費指数（成人100／子62・85）、算定表の適用範囲（年収軸の上限・子3人まで・
*   金額の幅）、子1人当たりへの按分式は、公式説明書（平成30年度司法研究の研究員
*   作成）で確認し、assets/santei-data.js に出典つきで収録した。
* - 算定表の表引き（表1〜19）は assets/santei-tables.js に実装した。
*   ただし1回目読み取り（2026-11-03）では、算定表が帯状チャート図のため
*   PDFテキスト抽出から金額グリッドの行列対応を復元できず、グリッド転記は
*   未完了。現時点で金額を返せるのは、説明書の使用例で交点の枠が明記された
*   アンカーセル（3件）のみで、それ以外は「データ確認中」として金額を出さない。
*   推測でセルを補うことはしない。2回目の独立読み取りで差分照合予定。
* - 年収→基礎収入の換算（基礎収入割合の年収帯別表）と標準算定方式の計算式は、
*   司法研修所編『養育費，婚姻費用の算定に関する実証的研究』（法曹会、2019年）に
*   掲載されているが、裁判所ウェブサイトでは公開されておらず【未取得】。
*   表引き方式を採用したため、この方式では換算表は不要。
*/
(function () {
'use strict';
var INDEX = { '0-14': 62, '15+': 85};
var MAX_CHILDREN = 6;

var form = document.getElementById('sim-form');
if (!form) return;
var tool = form.getAttribute('data-tool') || 'yoikuhi';
var childrenWrap = document.getElementById('children-fields');
var addBtn = document.getElementById('add-child');
var errorBox = document.getElementById('form-error');
var resultBox = document.getElementById('result');

function childRow(n) {
var div = document.createElement('div');
div.className = 'child-row';
div.innerHTML =
'<div class="field"><label>子' + n + ' の年齢区分</label>' +
'<select name="child-age"><option value="0-14">0〜14歳</option>' +
'<option value="15+">15歳以上</option></select></div>' +
(n > 1? '<button type="button" class="btn-remove">削除</button>': '');
var remove = div.querySelector('.btn-remove');
if (remove) {
remove.addEventListener('click', function () { div.remove(); renumber();});
}
return div;
}
function renumber() {
var rows = childrenWrap.querySelectorAll('.child-row');
rows.forEach(function (row, i) {
row.querySelector('label').textContent = '子' + (i + 1) + ' の年齢区分';
});
addBtn.style.display = rows.length >= MAX_CHILDREN? 'none': '';
}
var optionalChildren = form.getAttribute('data-children-optional') === 'true';
if (!optionalChildren) {
  childrenWrap.appendChild(childRow(1));
}
addBtn.addEventListener('click', function () {
var n = childrenWrap.querySelectorAll('.child-row').length;
if (n < MAX_CHILDREN) { childrenWrap.appendChild(childRow(n + 1)); renumber();}
});

function num(id) {
var v = document.getElementById(id).value;
return v === ''? NaN: Number(v);
}
function typeLabel(v) { return v === 'self'? '自営': '給与';}

/*
 * 金額レンジ算出（算定表の表引き。assets/santei-tables.js を使用）
 * input = { obligeeIncome, obligeeType, obligorIncome, obligorType, childCount, childrenAges }
 *   childrenAges: ['young' | 'old', ...]（'young'=0〜14歳、'old'=15歳以上）
 * 戻り値 = { status, reasons, range, lookup }
 *   status: 'ok'（range=[下限,上限]万円）| 'out-of-table-range' |
 *           'table-not-transcribed'（表・軸・セルの転記が未完で金額を返さない）|
 *           'data-missing'
 * 転記済みセルが無い組合せでは金額を推測せず、必ず 'table-not-transcribed' を返す。
 */
function calcRange(input) {
  var data = (typeof SanteiData !== 'undefined') ? SanteiData : null;
  if (!data || !data.TABLE_RANGE) {
    return { status: 'data-missing', reasons: [], range: null, lookup: null };
  }
  var r = data.TABLE_RANGE;
  var reasons = [];
  if (input.childCount > r.maxChildren) {
    reasons.push('算定表は子' + r.maxChildren + '人までの表しか用意されていないため、子が' + input.childCount + '人の場合は算定表の範囲外です。');
  }
  if (input.obligorIncome > r.obligorMaxManYen[input.obligorType]) {
    reasons.push('支払う側の年収が、算定表の年収の上限（' + typeLabel(input.obligorType) + 'の場合は' + r.obligorMaxManYen[input.obligorType].toLocaleString('ja-JP') + '万円）を超えているため、算定表の範囲外です。');
  }
  if (input.obligeeIncome > r.obligeeMaxManYen[input.obligeeType]) {
    reasons.push('受け取る側の年収が、算定表の年収の上限（' + typeLabel(input.obligeeType) + 'の場合は' + r.obligeeMaxManYen[input.obligeeType].toLocaleString('ja-JP') + '万円）を超えているため、算定表の範囲外です。');
  }
  if (reasons.length) {
    return { status: 'out-of-table-range', reasons: reasons, range: null, lookup: null };
  }
  var tables = (typeof SanteiTables !== 'undefined') ? SanteiTables : null;
  if (!tables) {
    return { status: 'data-missing', reasons: [], range: null, lookup: null };
  }
  var lk = tables.lookup({
    tool: tool,
    obligeeIncome: input.obligeeIncome, obligeeType: input.obligeeType,
    obligorIncome: input.obligorIncome, obligorType: input.obligorType,
    childrenAges: input.childrenAges || []
  });
  if (lk.status === 'ok') {
    return { status: 'ok', reasons: [], range: lk.rangeManYen, lookup: lk };
  }
  if (lk.status === 'no-table') {
    return { status: 'out-of-table-range', reasons: ['該当する算定表がありません。'], range: null, lookup: lk };
  }
  // 'axis-not-transcribed' / 'cell-not-transcribed' は金額を出さない
  return { status: 'table-not-transcribed', reasons: [], range: null, lookup: lk };
}

form.addEventListener('submit', function (ev) {
ev.preventDefault();
errorBox.style.display = 'none';
resultBox.style.display = 'none';

var obligeeIncome = num('obligee-income');
var obligorIncome = num('obligor-income');
var obligeeType = document.getElementById('obligee-type').value;
var obligorType = document.getElementById('obligor-type').value;
var ages = Array.prototype.map.call(
childrenWrap.querySelectorAll('select[name="child-age"]'),
function (s) { return s.value;}
);

var errors = [];
if (isNaN(obligeeIncome) || obligeeIncome < 0) errors.push('受け取る側の年収を入力してください。');
if (isNaN(obligorIncome) || obligorIncome < 0) errors.push('支払う側の年収を入力してください。');
if (ages.length === 0 && !optionalChildren) errors.push('子の年齢区分を入力してください。');
if (errors.length) {
errorBox.innerHTML = errors.join('<br>');
errorBox.style.display = 'block';
errorBox.scrollIntoView({ behavior: 'smooth', block: 'center'});
return;
}

var countYoung = ages.filter(function (a) { return a === '0-14';}).length;
var countOld = ages.filter(function (a) { return a === '15+';}).length;
var indexSum = countYoung * INDEX['0-14'] + countOld * INDEX['15+'];

var html = '<h3>入力内容の確認</h3>';
html += '<table>' +
'<tr><th>受け取る側の年収</th><td>' + obligeeIncome.toLocaleString('ja-JP') + '万円（' + typeLabel(obligeeType) + '）</td></tr>' +
'<tr><th>支払う側の年収</th><td>' + obligorIncome.toLocaleString('ja-JP') + '万円（' + typeLabel(obligorType) + '）</td></tr>' +
'<tr><th>子どもの構成</th><td>' + (ages.length === 0 ? '子なし' : '0〜14歳 ' + countYoung + '人 ／ 15歳以上 ' + countOld + '人') + '</td></tr>' +
'<tr><th>子の生活費指数の合計</th><td>' + indexSum + '（0〜14歳＝62、15歳以上＝85で計算）</td></tr>' +
'</table>';
var calc = calcRange({
obligeeIncome: obligeeIncome, obligeeType: obligeeType,
obligorIncome: obligorIncome, obligorType: obligorType,
childCount: ages.length,
childrenAges: ages.map(function (a) { return a === '15+' ? 'old' : 'young'; })
});
if (calc.status === 'ok' && calc.range) {
var lk = calc.lookup;
html += '<div class="result-amount">算定表に基づく月額の目安：' +
calc.range[0] + '万〜' + calc.range[1] + '万円</div>' +
'<p>使用した算定表：' + lk.table.title + '<br>' +
'あてはめた年収の目盛り：支払う側 ' + lk.obligorScale.scale.toLocaleString('ja-JP') + '万円／受け取る側 ' + lk.obligeeScale.scale.toLocaleString('ja-JP') + '万円（説明書の手順どおり、実際の年収に近い方の目盛りを使用）</p>' +
'<p>この金額は算定表の枠（レンジ）そのもので、1つの金額に定まるものではありません。レンジが動く要因（特別費用の有無、収入の変動など）は「<a href="santei-hyo.html">算定表の見方</a>」をご覧ください。</p>';
} else if (calc.status === 'out-of-table-range') {
html += '<div class="notice"><strong>算定表の範囲外について</strong><br>' +
calc.reasons.join('<br>') +
'算定表の範囲外の場合は、このツールでは金額の目安を示すことができません。</div>';
} else {
html += '<div class="notice"><strong>金額レンジ表示について</strong><br>' +
'この制作版では、この組合せに対する算定表データの照合がまだ完了していないため、月額の目安レンジを表示していません。' +
'算定の考え方は「<a href="santei-hyo.html">算定表の見方</a>」をご覧ください。</div>';
}

resultBox.innerHTML = html +
'<div class="disclaimer"><strong>免責</strong>：本結果は算定表に基づく一般的な目安です。個別の事情により変わります。正式な取り決めは専門家（弁護士・家庭裁判所）へ</div>';
resultBox.style.display = 'block';
resultBox.scrollIntoView({ behavior: 'smooth', block: 'start'});
});
})();
