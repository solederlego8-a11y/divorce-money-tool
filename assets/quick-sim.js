/*
 * 簡易シミュレーター（トップ冒頭・3ステップ選択式）
 * 2026-11-11 UI方針（先行実装）：いきなり読み込ませず、選択式3ステップで
 * 目安を即時表示し、正確な算定は既存の詳細ツールへ渡す二段構え。
 *
 * 計算は新規ロジックを作らず、詳細ツールと同じ SanteiTables.lookup を
 * そのまま使う（給与所得・代表年収は算定表の目盛りそのもの）。
 * そのため簡易版の結果が詳細ツールと矛盾することはない。
 * 算定表データ（santei-tables.js）自体には一切手を入れない。
 */
(function (root) {
'use strict';

function buildAges(childCount, oldCount) {
  var ages = [];
  for (var i = 0; i < childCount; i++) ages.push(i < oldCount ? 'old' : 'young');
  return ages;
}

/* input: {tool, obligorIncome, obligeeIncome, childCount, oldCount}（年収は万円・給与） */
function calc(input, tables) {
  var t = tables || root.SanteiTables;
  if (!t) return { status: 'data-missing', range: null, lookup: null };
  if (input.tool === 'yoikuhi' && input.childCount === 0) {
    return { status: 'no-child', range: null, lookup: null };
  }
  var lk = t.lookup({
    tool: input.tool,
    obligeeIncome: input.obligeeIncome, obligeeType: 'salary',
    obligorIncome: input.obligorIncome, obligorType: 'salary',
    childrenAges: buildAges(input.childCount, input.oldCount)
  });
  if (lk.status === 'ok') return { status: 'ok', range: lk.rangeManYen, lookup: lk };
  return { status: lk.status, range: null, lookup: lk };
}

var api = { calc: calc, buildAges: buildAges };
if (typeof module === 'object' && module.exports) module.exports = api;
root.QuickSim = api;

/* ---- ブラウザUI（Nodeテスト時は document が無いので何もしない） ---- */
if (typeof document === 'undefined') return;
var form = document.getElementById('quick-form');
if (!form) return;
var resultBox = document.getElementById('quick-result');
var started = false;

function ga(name, params) {
  if (typeof root.gtag === 'function') {
    try { root.gtag('event', name, params || {}); } catch (e) {}
  }
}
function markStart() {
  if (started) return;
  started = true;
  ga('quick_sim_start', { page_path: location.pathname });
}
form.addEventListener('change', markStart);
form.addEventListener('focusin', markStart);

var toolRadios = form.querySelectorAll('input[name="q-tool"]');
var childCountSel = document.getElementById('q-child-count');
var oldCountSel = document.getElementById('q-old-count');

function currentTool() {
  for (var i = 0; i < toolRadios.length; i++) if (toolRadios[i].checked) return toolRadios[i].value;
  return 'yoikuhi';
}
function syncChildOptions() {
  var tool = currentTool();
  var zeroOpt = childCountSel.querySelector('option[value="0"]');
  if (zeroOpt) zeroOpt.disabled = (tool === 'yoikuhi');
  if (tool === 'yoikuhi' && childCountSel.value === '0') childCountSel.value = '1';
  var n = Number(childCountSel.value);
  for (var j = 0; j < oldCountSel.options.length; j++) {
    oldCountSel.options[j].disabled = Number(oldCountSel.options[j].value) > n;
  }
  if (Number(oldCountSel.value) > n) oldCountSel.value = '0';
}
for (var r = 0; r < toolRadios.length; r++) toolRadios[r].addEventListener('change', syncChildOptions);
childCountSel.addEventListener('change', syncChildOptions);
syncChildOptions();

function fillDetailForm(input) {
  /* 養育費の詳細ツールは同ページ下部。入力を引き継いでスクロールする */
  var obligee = document.getElementById('obligee-income');
  var obligor = document.getElementById('obligor-income');
  if (obligee) obligee.value = input.obligeeIncome;
  if (obligor) obligor.value = input.obligorIncome;
  var wrap = document.getElementById('children-fields');
  var addBtn = document.getElementById('add-child');
  if (wrap && addBtn) {
    var guard = 0;
    while (wrap.querySelectorAll('.child-row').length < input.childCount && guard++ < 6) addBtn.click();
    var rows = wrap.querySelectorAll('.child-row');
    for (var i = 0; i < rows.length && i < input.childCount; i++) {
      var sel = rows[i].querySelector('select[name="child-age"]');
      if (sel) sel.value = (i < input.oldCount) ? '15+' : '0-14';
    }
  }
  var detail = document.getElementById('sim-form');
  if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', function (ev) {
  ev.preventDefault();
  markStart();
  var input = {
    tool: currentTool(),
    childCount: Number(childCountSel.value),
    oldCount: Number(oldCountSel.value),
    obligorIncome: Number(document.getElementById('q-obligor-income').value),
    obligeeIncome: Number(document.getElementById('q-obligee-income').value)
  };
  var res = calc(input);
  var toolLabel = input.tool === 'konpi' ? '婚姻費用' : '養育費';
  var html = '';
  if (res.status === 'ok') {
    html = '<p class="quick-result-label">簡易版・目安（' + toolLabel + '／給与所得の場合）</p>' +
      '<div class="result-amount">月額 ' + res.range[0] + '万〜' + res.range[1] + '万円</div>' +
      '<p>使用した算定表：' + res.lookup.table.title + '<br>' +
      'これは算定表の幅（レンジ）そのもので、確定額ではありません。正確な年収（自営業を含む）や個別の事情は、詳細ツールで確認してください。</p>';
    ga('quick_sim_complete', {
      tool_type: input.tool,
      result_range: res.range[0] + '-' + res.range[1],
      page_path: location.pathname
    });
    if (input.tool === 'yoikuhi') {
      html += '<p><button type="button" class="btn" id="quick-to-detail">正確な年収で詳細を確認する</button></p>' +
        '<p class="quick-sub">上の金額は、下の詳細ツールに年収と子どもの区分を引き継いで確認できます。</p>';
    } else {
      html += '<p><a class="btn" id="quick-to-detail" href="konpi-hiyo.html">婚姻費用の詳細ツールで確認する</a></p>' +
        '<p class="quick-sub">詳細ツールでは正確な年収と、自営業の場合も計算できます。</p>';
    }
  } else if (res.status === 'no-child') {
    html = '<div class="notice"><strong>子どもがいない場合</strong><br>' +
      '養育費は子どもが対象のため、子なしでは計算できません。別居中の生活費は「婚姻費用」にあたります。</div>' +
      '<p><a class="btn" id="quick-to-detail" href="konpi-hiyo.html">婚姻費用の詳細ツールで確認する</a></p>';
    ga('quick_sim_complete', { tool_type: input.tool, result_range: 'no-child', page_path: location.pathname });
  } else {
    html = '<div class="notice"><strong>この組合せは算定表で確認できませんでした</strong><br>' +
      '正確な年収を入力できる詳細ツールでお試しください。</div>' +
      (input.tool === 'yoikuhi'
        ? '<p><button type="button" class="btn" id="quick-to-detail">詳細ツールで確認する</button></p>'
        : '<p><a class="btn" id="quick-to-detail" href="konpi-hiyo.html">婚姻費用の詳細ツールで確認する</a></p>');
  }
  html += '<div class="disclaimer"><strong>免責</strong>：本結果は算定表に基づく一般的な目安です。個別の事情により変わります。正式な取り決めは専門家（弁護士・家庭裁判所）へ</div>';
  resultBox.innerHTML = html;
  resultBox.style.display = 'block';
  var toDetail = document.getElementById('quick-to-detail');
  if (toDetail) {
    toDetail.addEventListener('click', function () {
      ga('quick_sim_to_detail', { tool_type: input.tool, page_path: location.pathname });
      if (input.tool === 'yoikuhi' && toDetail.tagName === 'BUTTON') fillDetailForm(input);
    });
  }
  resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
})(typeof self !== 'undefined' ? self : this);
