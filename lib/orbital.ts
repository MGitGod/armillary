/**
 * @file orbital.ts
 * @description 軌道力学。純粋関数だけを置く（DOM も描画も持たない）。
 *
 * 角速度を恣意的な数値で決めると、動きが「なんとなく」になる。
 * ケプラーの第三法則に従わせることで、内側が速く外側が遅いという
 * 見た目の理屈が最初から入る。
 */

/** viewBox の一辺。SVG 内部座標はこの正方形で完結させる。 */
export const VIEW = 720;
export const CENTER = VIEW / 2;

/**
 * ケプラーの第三法則 T² ∝ a³ より ω = √(GM / a³)。
 * gm は見た目の速度を決める係数。
 */
export const angularVelocity = (radius: number, gm: number) =>
  Math.sqrt(gm / (radius * radius * radius));

export type Body = {
  id: string;
  label: string;
  /** 軌道半径（viewBox 単位） */
  radius: number;
  /** 角速度 rad/s */
  omega: number;
  /** 初期位相 deg */
  phase: number;
  /** 天体の見かけの半径 */
  size: number;
};

export type LayoutOptions = {
  inner?: number;
  outer?: number;
  gm?: number;
};

/**
 * 黄金角（137.5°）で初期位相を散らす。
 * 等分割にすると全天体が対称に並んで機械的に見えるが、
 * 黄金角なら何個でも重ならずに散る（葉序と同じ理屈）。
 */
const GOLDEN_ANGLE = 137.50776405003785;

export const layoutBodies = (
  items: { id: string; label: string }[],
  { inner = 96, outer = 300, gm = 90000 }: LayoutOptions = {},
): Body[] => {
  const n = items.length;

  return items.map((item, i) => {
    const t = n <= 1 ? 0 : i / (n - 1);
    const radius = inner + (outer - inner) * t;

    return {
      id: item.id,
      label: item.label,
      radius,
      omega: angularVelocity(radius, gm),
      phase: (i * GOLDEN_ANGLE) % 360,
      // 外側ほど小さく＝遠い、という素朴な遠近
      size: 8 - t * 3,
    };
  });
};

/** 時刻 t（秒）における公転角（deg）。 */
export const angleAt = (body: Body, t: number) =>
  body.phase + (body.omega * t * 180) / Math.PI;

/**
 * angleAt の逆関数。その角度に到達する時刻を返す。
 * angleAt は正規化しない（周回で増え続ける）ので、周回数の曖昧さがなく一意に解ける。
 * 停止させた天体を、止めた角度から連続に再開させるために使う。
 */
export const timeAtAngle = (body: Body, deg: number) =>
  ((deg - body.phase) * Math.PI) / (180 * body.omega);

/** 時刻 t における中心からの座標。 */
export const positionAt = (body: Body, t: number) => {
  const rad = (angleAt(body, t) * Math.PI) / 180;
  return { x: Math.cos(rad) * body.radius, y: Math.sin(rad) * body.radius };
};

export type Tick = { angle: number; major: boolean };

/** 最外周の角度目盛り。majorEvery ごとに長い罫。 */
export const ticks = (count: number, majorEvery: number): Tick[] =>
  Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * 360,
    major: i % majorEvery === 0,
  }));

/** 角度を 0..360 に畳む。読み取り値の表示用。 */
export const normalizeAngle = (deg: number) => ((deg % 360) + 360) % 360;
