/*
 * 法定養育費チェッカー 判定ロジック
 * 根拠：仕様書v0.2 §2-3（民法766条の3／令和6年法律第33号、金額は令和7年法務省令第56号）
 * - 施行日：2026年4月1日
 * - 金額：子1人あたり月2万円
 * - 対象：離婚時に養育費の取り決めをすることなく離婚し、離婚の時から引き続き子を主として監護する親（認知の場合も対象）
 * - 対象外：離婚・認知が施行日前／取り決めがある（「支払わない」旨の取り決めも含む）
 * - 終了：取り決めをした日／審判確定日／子が18歳に達した日のいずれか早い日まで
 * 本ロジックは一般的な情報提供のための目安判定であり、個別事案の法的判断ではない。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HouteiLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ENFORCEMENT_DATE = '2026-04-01';
  var MONTHLY_PER_CHILD = 20000;
  var SENTOKU_LIMIT_PER_CHILD = 80000;

  // 'YYYY-MM-DD' 同士は文字列比較で前後判定できる
  function isValidDateStr(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    var p = s.split('-');
    var y = +p[0], m = +p[1], d = +p[2];
    if (m < 1 || m > 12 || d < 1) return false;
    var daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return d <= daysInMonth;
  }

  function addYears(dateStr, years) {
    var p = dateStr.split('-');
    var y = +p[0] + years, m = +p[1], d = +p[2];
    var daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > daysInMonth) d = daysInMonth;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return y + '-' + pad(m) + '-' + pad(d);
  }

  function formatJa(dateStr) {
    if (!isValidDateStr(dateStr)) return '';
    var p = dateStr.split('-');
    return (+p[0]) + '年' + (+p[1]) + '月' + (+p[2]) + '日';
  }

  /*
   * input = {
   *   type: 'divorce' | 'ninchi',
   *   date: 'YYYY-MM-DD',                // 離婚日または認知日
   *   arrangementAtStart: 'none' | 'pay' | 'nopay',
   *   mainCustody: true | false,          // 離婚等の時から引き続き主として監護しているか
   *   laterEvent: { kind: 'none' | 'arrangement' | 'judgment', date: 'YYYY-MM-DD' | '' },
   *   children: [ { birth: 'YYYY-MM-DD' } ],
   *   today: 'YYYY-MM-DD'
   * }
   */
  function judge(input) {
    var reasons = [];
    var notes = [];
    var result = {
      status: 'eligible', // 'eligible' | 'ineligible' | 'ended'
      reasons: reasons,
      notes: notes,
      perChild: [],
      monthlyTotal: 0,
      startDate: input.date,
      laterEventDate: null
    };

    if (!isValidDateStr(input.date)) {
      result.status = 'ineligible';
      reasons.push('離婚日（または認知日）が正しく入力されていません。');
      return result;
    }
    if (!input.children || input.children.length === 0) {
      result.status = 'ineligible';
      reasons.push('子の情報が入力されていません。');
      return result;
    }

    // --- 対象外の分岐（仕様書 §2-3 判定分岐） ---
    var blocked = false;
    if (input.date < ENFORCEMENT_DATE) {
      blocked = true;
      reasons.push('離婚（または認知）が2026年4月1日より前です。法定養育費は施行日以降の離婚・認知が対象で、施行前の離婚には遡って適用されません（経過措置はありません）。');
    }
    if (input.arrangementAtStart === 'pay') {
      blocked = true;
      reasons.push('離婚（認知）の時に養育費の取り決めをしています。法定養育費は「取り決めをすることなく離婚した」場合の制度のため、対象外です。');
    }
    if (input.arrangementAtStart === 'nopay') {
      blocked = true;
      reasons.push('「養育費を支払わない」旨を含む取り決めがある場合も、「定めをした」ものとして扱われ、法定養育費の対象外です。');
    }
    if (input.mainCustody === false) {
      blocked = true;
      reasons.push('法定養育費の対象は、離婚（認知）の時から引き続き子を主として監護する親です。主たる監護者でない場合は対象外となる可能性があります。');
    }
    if (blocked) {
      result.status = 'ineligible';
      return result;
    }

    // --- 終了イベント ---
    var later = input.laterEvent || { kind: 'none', date: '' };
    var laterDate = null;
    if (later.kind !== 'none' && isValidDateStr(later.date)) {
      laterDate = later.date;
      result.laterEventDate = laterDate;
    }

    // --- 子ごとの判定 ---
    var today = isValidDateStr(input.today) ? input.today : ENFORCEMENT_DATE;
    var anyActive = false;
    var allPast18 = true;
    input.children.forEach(function (child, i) {
      var eighteenth = addYears(child.birth, 18);
      var end = eighteenth;
      if (laterDate && laterDate < end) end = laterDate;
      var started = today >= input.date;
      var active = started && today < end;
      if (today < eighteenth) allPast18 = false;
      if (active) anyActive = true;
      result.perChild.push({
        index: i + 1,
        birth: child.birth,
        eighteenth: eighteenth,
        endDate: end,
        endReason: (laterDate && laterDate < eighteenth)
          ? (later.kind === 'judgment' ? '審判確定日' : '取り決めをした日')
          : '子が18歳に達した日',
        active: active,
        monthly: active ? MONTHLY_PER_CHILD : 0
      });
    });
    result.monthlyTotal = result.perChild.reduce(function (sum, c) { return sum + c.monthly; }, 0);

    if (!anyActive) {
      result.status = 'ended';
      if (laterDate && today >= laterDate) {
        reasons.push('取り決めをした日（または審判確定日）を迎えたため、法定養育費の対象期間は終了しています。');
      } else if (allPast18) {
        reasons.push('すべての子が18歳に達したため、法定養育費の対象期間は終了しています。');
      } else {
        reasons.push('現在は法定養育費の対象期間外です。');
      }
      return result;
    }

    notes.push('金額は子1人あたり月2万円です。この2万円は標準額・下限額ではありません（法務省の注意喚起）。実際の養育費は、取り決めや審判により収入等に応じて決まります。');
    notes.push('相手方（義務者）に支払能力の欠如や生活の著しい窮迫がある場合は、支払いを拒める場合があります。');
    return result;
  }

  return {
    ENFORCEMENT_DATE: ENFORCEMENT_DATE,
    MONTHLY_PER_CHILD: MONTHLY_PER_CHILD,
    SENTOKU_LIMIT_PER_CHILD: SENTOKU_LIMIT_PER_CHILD,
    isValidDateStr: isValidDateStr,
    addYears: addYears,
    formatJa: formatJa,
    judge: judge
  };
});
