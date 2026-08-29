/**
 * @file parallax-astro.ts
 * @description 恒星視差。純粋関数とデータだけを置く（DOM も描画も持たない）。
 *
 * 視差を装飾ではなく計測として扱うための道具。
 * 地球が軌道を一周するあいだ、星は空の上で楕円を描く。半軸は ϖ と ϖ·sin β。
 * 黄道の極では真円に、黄道面上では直線に退化する。
 * 楕円の大きさは距離の逆数にそのまま比例する。
 */

/** 1 パーセク = 3.26156 光年。 */
export const LY_PER_PC = 3.26156;

/**
 * 図の縮尺。1 秒角あたりの px。
 * 実際の見かけの角度に対して極端な誇張で、ESA の Gaia 解説動画も
 * 同じく約 1 万倍で描いている。誇張していること自体を画面に出す。
 */
export const ARCSEC_PX = 90;

/** 地上観測で視差が測れる限界。図の上で 1px 未満は測れないものとして扱う。 */
export const MEASURABLE_PX = 1;

export type Star = {
  name: string;
  /** 年周視差 ϖ ["]。Hipparcos / Gaia の実測。 */
  parallax: number;
  /** 黄緯 β [deg]。概数。楕円の潰れ方を決める。 */
  eclipticLat: number;
  /** 図上の基準位置（viewBox 620×350）。 */
  x: number;
  y: number;
  /** 描画半径。 */
  mag: number;
};

/**
 * 視差の降順＝近い順に並べてある。表の並びをここで保証する。
 *
 * 下 2 つは図上のずれが 1px を切る。これが重要で、
 * 地上観測の限界（約 100 pc）がそのまま図に出る
 * ──「測れない」を演出ではなく事実として見せられる。
 */
export const STARS: Star[] = [
  { name: 'Proxima Centauri', parallax: 0.7687, eclipticLat: -44.6, x: 108, y: 262, mag: 2.0 },
  { name: 'Sirius',           parallax: 0.3792, eclipticLat: -39.6, x: 296, y: 196, mag: 3.4 },
  { name: 'Altair',           parallax: 0.1948, eclipticLat:  29.3, x: 452, y: 118, mag: 2.6 },
  { name: 'Vega',             parallax: 0.1303, eclipticLat:  61.7, x: 196, y:  84, mag: 2.9 },
  { name: 'Polaris',          parallax: 0.0076, eclipticLat:  66.1, x: 516, y:  58, mag: 2.2 },
  { name: 'Betelgeuse',       parallax: 0.0055, eclipticLat: -16.0, x: 384, y: 278, mag: 3.1 },
];

const rad = (deg: number) => (deg * Math.PI) / 180;

/** 視差楕円の半軸。長軸 ϖ、短軸 ϖ·|sin β|。 */
export const ellipseAxes = (parallax: number, eclipticLat: number) => ({
  major: parallax,
  minor: parallax * Math.abs(Math.sin(rad(eclipticLat))),
});

/**
 * 公転位相 θ（0〜2π が一年）における見かけのずれ［秒角］。
 * θ を一周させると半軸 (ϖ, ϖ·sin β) の楕円をなぞる。
 */
export const parallaxOffset = (parallax: number, eclipticLat: number, theta: number) => ({
  dx: -parallax * Math.sin(theta),
  dy: -parallax * Math.cos(theta) * Math.sin(rad(eclipticLat)),
});

/**
 * d[pc] = 1 / ϖ["]。
 * これは測距儀の式 d = B/θ の、B = 1 AU・θ = 秒角 という特殊形にすぎない
 * （#15 が同じ式を基線長を変えて使う）。
 */
export const parsecFromArcsec = (parallax: number) => 1 / parallax;

export const lightYears = (pc: number) => pc * LY_PER_PC;

/** 図上のずれ [px]。 */
export const pixelShift = (parallax: number, k = ARCSEC_PX) => parallax * k;

/** 図の上で測れるか。1px を切ると測れない。 */
export const isMeasurable = (parallax: number, k = ARCSEC_PX) =>
  pixelShift(parallax, k) >= MEASURABLE_PX;
