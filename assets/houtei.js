/* 法定養育費チェッカー UI（判定は houtei-logic.js の HouteiLogic.judge を使用） */
(function () {
  'use strict';
  var L = window.HouteiLogic;
  var MAX_CHILDREN = 5;

  var childrenWrap = document.getElementById('children-fields');
  var addBtn = document.getElementById('add-child');
  var form = document.getElementById('houtei-form');
  var errorBox = document.getElementById('form-error');
  var resultBox = document.getElementById('result');

  function childRow(n) {
    var div = document.createElement('div');
    div.className = 'child-row';
    div.innerHTML =
      '<div class="field"><label>子' + n + ' の生年月日</label>' +
      '<input type="date" name="child-birth" required></div>' +
      (n > 1 ? '<button type="button" class="btn-remove">削除</button>' : '');
    var remove = div.querySelector('.btn-remove');
    if (remove) {
      remove.addEventListener('click', function () {
        div.remove();
        renumber();
      });
    }
    return div;
  }
  function renumber() {
    var rows = childrenWrap.querySelectorAll('.child-row');
    rows.forEach(function (row, i) {
      row.querySelector('label').textContent = '子' + (i + 1) + ' の生年月日';
    });
    addBtn.style.display = rows.length >= MAX_CHILDREN ? 'none' : '';
  }
  childrenWrap.appendChild(childRow(1));
  addBtn.addEventListener('click', function () {
    var n = childrenWrap.querySelectorAll('.child-row').length;
    if (n < MAX_CHILDREN) {
      childrenWrap.appendChild(childRow(n + 1));
      renumber();
    }
  });

  function yen(n) { return n.toLocaleString('ja-JP') + '円'; }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    errorBox.style.display = 'none';
    resultBox.style.display = 'none';

    var type = form.querySelector('input[name="type"]:checked').value;
    var date = document.getElementById('event-date').value;
    var arrangement = form.querySelector('input[name="arrangement"]:checked');
    var custody = form.querySelector('input[name="custody"]:checked');
    var laterKind = form.querySelector('input[name="later"]:checked');
    var laterDate = document.getElementById('later-date').value;
    var births = Array.prototype.map.call(
      childrenWrap.querySelectorAll('input[name="child-birth"]'),
      function (i) { return i.value; }
    );

    var errors = [];
    if (!L.isValidDateStr(date)) errors.push('離婚日（または認知日）を入力してください。');
    if (!arrangement) errors.push('取り決めの有無を選んでください。');
    if (!custody) errors.push('監護の状況を選んでください。');
    if (!laterKind) errors.push('その後の取り決め・審判の有無を選んでください。');
    if (laterKind && laterKind.value !== 'none' && !L.isValidDateStr(laterDate)) {
      errors.push('取り決めをした日（または審判確定日）を入力してください。');
    }
    if (births.length === 0 || births.some(function (b) { return !L.isValidDateStr(b); })) {
      errors.push('子の生年月日を入力してください。');
    }
    if (errors.length) {
      errorBox.innerHTML = errors.join('<br>');
      errorBox.style.display = 'block';
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    var now = new Date();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    var today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());

    var r = L.judge({
      type: type,
      date: date,
      arrangementAtStart: arrangement.value,
      mainCustody: custody.value === 'yes',
      laterEvent: { kind: laterKind.value, date: laterDate },
      children: births.map(function (b) { return { birth: b }; }),
      today: today
    });

    var html = '';
    if (r.status === 'eligible') {
      html += '<p class="status ok">法定養育費の対象となる可能性があります</p>';
      html += '<p>現在の目安額（' + today.replace(/-/g, '/') + ' 時点）</p>';
      html += '<p class="result-amount">月額 ' + yen(r.monthlyTotal) + '</p>';
      html += '<p>内訳：子1人あたり月' + yen(L.MONTHLY_PER_CHILD) + ' × 対象の子 ' +
        r.perChild.filter(function (c) { return c.active; }).length + '人</p>';
      html += '<table><tr><th>子</th><th>対象期間の終了</th><th>月額</th></tr>';
      r.perChild.forEach(function (c) {
        html += '<tr><td>子' + c.index + '（' + L.formatJa(c.birth) + '生）</td><td>' +
          L.formatJa(c.endDate) + 'まで（' + c.endReason + '）</td><td>' +
          (c.active ? yen(c.monthly) : '対象期間外') + '</td></tr>';
      });
      html += '</table>';
      html += '<p>対象期間の開始は、離婚（または認知）の時（' + L.formatJa(r.startDate) + '）からです。</p>';
    } else if (r.status === 'ended') {
      html += '<p class="status ng">現在は法定養育費の対象期間ではありません</p>';
    } else {
      html += '<p class="status ng">法定養育費の対象外と考えられます</p>';
    }
    if (r.reasons.length) {
      html += '<h3>判定の理由</h3><ul>' +
        r.reasons.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>';
    }
    if (r.notes.length) {
      html += '<div class="notice"><strong>注意</strong><ul>' +
        r.notes.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul></div>';
    }
    html += '<div class="info-box"><strong>関連情報：養育費の先取特権</strong><br>' +
      '養育費の取り決め文書がある場合、養育費請求権には先取特権（子1人につき月' + yen(L.SENTOKU_LIMIT_PER_CHILD) +
      'まで）が認められ、公正証書などの債務名義がなくても差押えができる場合があります。詳しくは「' +
      '<a href="houtei-yoikuhi.html">法定養育費とは</a>」をご覧ください。</div>';

    resultBox.innerHTML = html +
      '<div class="disclaimer"><strong>免責</strong>：本結果は算定表に基づく一般的な目安です。個別の事情により変わります。正式な取り決めは専門家（弁護士・家庭裁判所）へ</div>';
    resultBox.style.display = 'block';
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
