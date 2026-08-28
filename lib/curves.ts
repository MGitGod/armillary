/**
 * @file curves.ts
 * @description 三角関数で描く曲線の生成。純粋関数だけ（DOM も GSAP も持たない）。
 *
 * SVG のパス文字列を返すので、DrawSVG でも MotionPath でもそのまま食わせられる。
 */

/**
 * 数値を SVG に入れる桁数に丸める。
 *
 * 文字列長を抑える目的もあるが、より重要なのはハイドレーション。
 * Math.sin / cos の結果は ECMAScript 仕様上「実装依存」で、
 * サーバー(Node の V8)とブラウザ(Chrome の V8)でバージョンが違えば
 * 最終桁がずれる。生の値を属性に入れると React が不一致を報告する。
 * このモジュールが DOM に出す数値は必ずここを通すこと。
 */
const f = (n: number) => Number(n.toFixed(2));

const toPath = (pts: Array<[number, number]>, close: boolean) => {
  if (pts.length === 0) return '';
  const [x0, y0] = pts[0];
  const rest = pts.slice(1).map(([x, y]) => `L${f(x)},${f(y)}`);
  return `M${f(x0)},${f(y0)}${rest.join('')}${close ? 'Z' : ''}`;
};

/**
 * バラ曲線（rhodonea）: r = R·cos(kθ)
 *
 * k が整数のとき、奇数なら k 枚、偶数なら 2k 枚の花弁になる。
 * k が有理数 p/q なら閉じるまでに q 周まわる。
 *
 * @param k 花弁の係数
 * @param radius 最大半径
 * @param samples 分割数
 * @param turns 何周ぶん描くか（k が分数のときに増やす）
 */
export const rosePath = (
  k: number,
  radius: number,
  samples = 720,
  turns = 1,
): string => {
  const pts: Array<[number, number]> = [];
  const total = Math.PI * 2 * turns;

  for (let i = 0; i <= samples; i++) {
    const th = (i / samples) * total;
    const r = radius * Math.cos(k * th);
    pts.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  return toPath(pts, false);
};

/**
 * リサージュ曲線: x = A·sin(a·t + δ), y = B·sin(b·t)
 *
 * a:b の比が単純なほど図形が閉じて静止して見え、
 * 比を少しずらすと図形がゆっくり回るように見える。
 *
 * @param a x 方向の周波数
 * @param b y 方向の周波数
 * @param delta 位相差（rad）
 * @param radius 振幅
 * @param samples 分割数
 */
export const lissajousPath = (
  a: number,
  b: number,
  delta: number,
  radius: number,
  samples = 900,
): string => {
  const pts: Array<[number, number]> = [];

  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    pts.push([radius * Math.sin(a * t + delta), radius * Math.sin(b * t)]);
  }
  return toPath(pts, false);
};

/**
 * 正 n 角形。MorphSVG で辺の数を渡り歩かせるために使う。
 * 頂点数を揃えないとモーフが暴れるので、辺上に等間隔の点を打って
 * 常に同じ点数のパスを返す。
 *
 * @param sides 辺の数
 * @param radius 外接円の半径
 * @param points 出力する総点数（全形状で揃える）
 */
export const polygonPath = (sides: number, radius: number, points = 240): string => {
  const pts: Array<[number, number]> = [];

  for (let i = 0; i < points; i++) {
    // 多角形の周上の位置（0..sides）
    const u = (i / points) * sides;
    const edge = Math.floor(u);
    const frac = u - edge;

    const a0 = ((edge / sides) * Math.PI * 2) - Math.PI / 2;
    const a1 = (((edge + 1) / sides) * Math.PI * 2) - Math.PI / 2;

    const x0 = Math.cos(a0) * radius;
    const y0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const y1 = Math.sin(a1) * radius;

    pts.push([x0 + (x1 - x0) * frac, y0 + (y1 - y0) * frac]);
  }
  return toPath(pts, true);
};

/**
 * 円周上に等間隔で置いた点。パーティクルの初期配置などに。
 *
 * x/y は DOM に出る座標なので丸める（理由は f() のコメント）。
 * angle は計算用の生の値。そのまま属性に入れないこと。
 */
export const ringPoints = (count: number, radius: number, phase = 0) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + phase;
    return { x: f(Math.cos(a) * radius), y: f(Math.sin(a) * radius), angle: a };
  });

/**
 * 円弧のパス。真上を 0° として時計回り。
 * ゲージの目盛りやセグメントに使う。
 *
 * @param radius 半径
 * @param from 開始角(deg)
 * @param to 終了角(deg)
 */
export const arcPath = (radius: number, from: number, to: number): string => {
  const at = (deg: number): [number, number] => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [Math.cos(rad) * radius, Math.sin(rad) * radius];
  };
  const [x0, y0] = at(from);
  const arc = (x: number, y: number, large: 0 | 1) =>
    `A${radius},${radius} 0 ${large} 1 ${f(x)},${f(y)}`;

  // 360° 以上は 1 つの A コマンドでは描けない。始点と終点が一致して何も出ない。
  // わずかに手前で止める手もあるが、座標を丸めている以上その差は消えうる
  // （r=50 で 0.01° は約 0.009 単位＝丸めで潰れる）。半周ずつ 2 本に割る。
  if (to - from >= 360) {
    const [xm, ym] = at(from + 180);
    return `M${f(x0)},${f(y0)}${arc(xm, ym, 1)}${arc(x0, y0, 1)}`;
  }

  const [x1, y1] = at(to);
  return `M${f(x0)},${f(y0)}${arc(x1, y1, to - from > 180 ? 1 : 0)}`;
};
