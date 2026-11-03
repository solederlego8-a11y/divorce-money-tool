/*
* 養育費・婚姻費用 算定データ（令和元年版・改定標準算定表）
*
* 本ファイルの数値は、一次情報（平成30年度司法研究の研究員が作成した公式説明書
* 「養育費・婚姻費用算定表について」）で確認できたものだけを収録する。
* 一次情報で確認できなかった項目は null とし、status に「未取得」と明記する。
* 推測による補完は一切していない。
*
*
* - 生活費指数（成人100／子0〜14歳62／子15歳以上85）：取得済み（公式説明書）
* - 婚姻費用側の配偶者の生活費指数：成人（親）=100 の定義により 100（公式説明書）
* - 算定表の年収軸の範囲・子の人数の範囲・金額の幅：取得済み（公式説明書／算定表）
* - 子1人当たりの額への按分式：取得済み（公式説明書に計算例つきで明記）
* - 年収→基礎収入の換算（基礎収入割合の年収帯別表）：
* 司法研修所編『養育費，婚姻費用の算定に関する実証的研究』（法曹会、2019年、
* ISBN 978-4-86684-031-4）に掲載されているが、裁判所ウェブサイトでは
* 説明書と算定表のみが公開されており、割合表は公開されていない。
* 二次情報には全体の範囲（給与38〜54%／自営48〜61%）の記載があるが、
* 年収帯別の値ではないため、本ファイルでは採用しない。
* - 標準算定方式の計算式（基礎収入と生活費指数から金額を求める式）：
* 同書に掲載。公式説明書には金額の按分の考え方と子1人当たり按分式のみ記載。
* 基礎収入割合表が無いため、式があっても金額は算出できない。
*
* そのため、現時点では金額レンジの算出は有効化しない（simulator.js の calcRange 参照）。
*/
(function (root, factory) {
if (typeof module === 'object' && module.exports) {
module.exports = factory();
} else {
root.SanteiData = factory();
}
})(typeof self!== 'undefined'? self: this, function () {
'use strict';

var SOURCES = {
setsumeisho: {
title: '「養育費・婚姻費用算定表について」（平成30年度司法研究の研究員が研究結果を踏まえ作成した公式説明書。算定表〈表1〜19〉を含む）',
distributor: '東京家庭裁判所「養育費算定表」ページ',
distributorUrl: 'https://www.courts.go.jp/tokyo-f/saiban/tetuzuki/youikuhi_santei_hyou/index.html',
retrievedFrom: 'https://7834-09.law-yamashita.com/wp-content/uploads/2019/12/b9153cede995ddeaf0fbffe6cc61241f.pdf',
retrievedFromNote: '裁判所が配布した説明書PDFの複製（弁護士事務所サイト掲載分）から取得。文書自体は研究員作成の公式説明書である旨の記載あり'
},
jiji: {
title: '時事通信「養育費の目安、16年ぶり改定＝月1〜2万円増額ケースも―最高裁」（2019年12月22日掲載）。表1の読み取り例（義務者500万円・権利者200万円・子1人0〜14歳→4〜6万円）の確認に使用した報道',
url: 'https://www.jiji.com/jc/graphics?p=ve_pol_seisaku-houmushihou20191222j-03-w470'
},
book: {
title: '司法研修所編『養育費，婚姻費用の算定に関する実証的研究』法曹会（2019年12月23日発行）。基礎収入割合表と標準算定方式の計算式の掲載先（書籍のため未取得）',
isbn: '978-4-86684-031-4',
bibliographyUrl: 'https://www.yodobashi.com/product/100000009003239470/'
}
};

// 生活費指数（公式説明書：子の指数は「親を100とした場合」の割合として定義）
var LIFE_INDEX = {
adult: 100, // 親（成人）。婚姻費用側の配偶者も成人としてこの値を使う
childYoung: 62, // 子 0〜14歳
childOld: 85 // 子 15歳以上
};

// 算定表（令和元年版）の適用範囲
// 年収軸の上限は算定表の目盛りの範囲。二次情報（法律情報サイト等）でも同値を確認
var TABLE_RANGE = {
obligorMaxManYen: { salary: 2000, self: 1567}, // 義務者の年収上限（万円）
obligeeMaxManYen: { salary: 1000, self: 763}, // 権利者の年収上限（万円）
maxChildren: 3, // 算定表は子1〜3人用（養育費 表1〜9／婚姻費用 表10〜19、夫婦のみは表10）
bandWidthNote: {
yoikuhi: '養育費の表は、義務者の年収が少ない場合は月1万円、それ以外の場合は月2万円の幅で表示される',
konpi: '婚姻費用の表は、月1万円から2万円の幅で表示される'
}
};

/*
* 子1人当たりの額への按分（公式説明書に明記された求め方）
* 子ごとの額 = 全額 × その子の指数 ÷ 子の指数合計（万円単位に四捨五入）
* 公式説明書の例：全額5万円・子10歳と15歳 → 10歳の子2万円（5×62÷(62+85)）、15歳の子3万円（5×85÷(62+85)）
* ages: ['young' | 'old',...]、totalManYen: 合計額（万円）
*/
function splitPerChild(totalManYen, ages) {
var idx = ages.map(function (a) { return a === 'old'? LIFE_INDEX.childOld: LIFE_INDEX.childYoung;});
var sum = idx.reduce(function (s, v) { return s + v;}, 0);
if (sum === 0) return [];
return idx.map(function (v) { return Math.round(totalManYen * v / sum);});
}

// 年収→基礎収入の換算（基礎収入割合の年収帯別表）。掲載先は SOURCES.book
var BASIC_INCOME_RATIO_TABLE = null;

// 標準算定方式の計算式そのもの。掲載先は SOURCES.book
// 公式説明書で確認できるのは「子の生活費を生活費指数で按分する」という考え方と、
// 上記 splitPerChild（子1人当たりへの按分）のみ
var CALC_FORMULA = null;

/*
* 公式説明書に掲載された使用例（表の読み取り例）。
* 金額算出を有効化した際の回帰テスト用ケースとして保持する。
* いずれも給与所得者同士・年収は説明書が「基準」とした目盛り値。
*/
var VERIFICATION_CASES = [
{
id: 'setsumeisho-yoikuhi-1',
tool: 'yoikuhi',
table: '表3（子2人・第1子及び第2子0〜14歳）',
obligeeIncomeManYen: 202.8, obligeeScaleManYen: 200, obligeeType: 'salary',
obligorIncomeManYen: 715.2, obligorScaleManYen: 725, obligorType: 'salary',
childrenAges: ['young', 'young'],
expectedRangeManYen: [10, 12],
source: 'setsumeisho'
},
{
id: 'setsumeisho-konpi-1',
tool: 'konpi',
table: '表10（婚姻費用・夫婦のみ）',
obligeeIncomeManYen: 243.3452, obligeeScaleManYen: 250, obligeeType: 'salary',
obligorIncomeManYen: 739.4958, obligorScaleManYen: 750, obligorType: 'salary',
childrenAges: [],
expectedRangeManYen: [8, 10],
source: 'setsumeisho'
},
{
id: 'jiji-yoikuhi-1',
tool: 'yoikuhi',
table: '表1（子1人・子0〜14歳）',
obligeeIncomeManYen: 200, obligeeScaleManYen: 200, obligeeType: 'salary',
obligorIncomeManYen: 500, obligorScaleManYen: 500, obligorType: 'salary',
childrenAges: ['young'],
expectedRangeManYen: [4, 6],
source: 'jiji'
}
];

return {
SOURCES: SOURCES,
LIFE_INDEX: LIFE_INDEX,
TABLE_RANGE: TABLE_RANGE,
splitPerChild: splitPerChild,
BASIC_INCOME_RATIO_TABLE: BASIC_INCOME_RATIO_TABLE,
CALC_FORMULA: CALC_FORMULA,
VERIFICATION_CASES: VERIFICATION_CASES
};
});
