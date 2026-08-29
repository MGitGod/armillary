/**
 * @file rangefinder.ts
 * @description 実験 #15「測距儀」の幾何と測距。純粋関数だけを置く（DOM も描画も持たない）。
 *
 * 実験側（`components/lab/experiments/rangefinder.tsx`）は、この場の座標を読んで
 * DOM に書くだけにする。式をここへ出しておくと Node で検算できるので、
 * 「測距儀と名乗りながら何も測っていない」状態をテストで防げる。
 * 実際に一度その状態で実装され、レビューで見つかった（spec の「実装後」節を参照）。
 *
 * `lib/radial-burst.ts` と同じ扱い ── 実験 1 つぶんの数学を lib に置く。
 */

import { EYE_Z_RATIO, projectOffAxis } from './frustum.ts';

export const STAGE_W = 600;
export const STAGE_H = 420;

/** 視点距離。焦点距離 f にあたる。 */
export const EYE_Z = STAGE_W * EYE_Z_RATIO;

/** 基線長。観測者がこの幅だけ横へ移動する。d = f·B/θ の B の最大値。 */
export const BASELINE = STAGE_W;

/**
 * 標的の実際の深度。読み値の答え合わせ用（画面には出さない）。
 *
 * −430 は「レチクルの目盛りを標的が横切りきる」ように選んだ。
 * 浅くすると行程の途中で画面外へ出て、深くすると動きが小さくて読めない。
 */
export const TARGET_Z = -430;

/** 層の深度。z ∈ [0,1] を実際の奥行きへ写す。 */
export const layerDepth = (z: number) => -60 - z * 420;

/** 行程 p ∈ [0,1] における観測者の横位置。基線の左端から右端へ。 */
export const eyeXAt = (p: number) => (p - 0.5) * BASELINE;

const eyeAt = (p: number) => ({ x: eyeXAt(p), y: 0, z: EYE_Z });

/** 行程 p における標的の投影 x。 */
export const targetXAt = (p: number) =>
  projectOffAxis({ x: 0, y: 0, z: TARGET_Z }, eyeAt(p)).x;

/** 行程 p における層 z の投影 x。ばねの目標値になる。 */
export const ridgeXAt = (p: number, z: number) =>
  projectOffAxis({ x: 0, y: 0, z: layerDepth(z) }, eyeAt(p)).x;

/** 走査した基線長。行程に比例して単調に伸びる。 */
export const baselineAt = (p: number) => p * BASELINE;

/**
 * 標的のずれ角。**消失点（無限遠）基準**で測る。
 *
 * これは #11 が「視差 0 の遠景」を基準にしているのと同じ取り方で、
 * 両者が同じ式で閉じるかどうかはここで決まる。
 *
 * 標的自身の初期位置を基準にすると `|Z| = f·Δθ/(B−Δθ)` になり、
 * **ずれが大きいほど遠い**という逆の単調性になって d = B/θ とは別の式になる。
 * さらに初版は基線を「中央からの距離×2」で取っていたため、B も Δθ も |eyeX| に
 * 比例して比が定数になり、何も測っていなかった。両方ともレビューで見つかった。
 *
 * 代数: rel = t.x − eyeX = −eyeX·t（t = f/(f+|Z|)）なので Δθ = t·B。
 */
export const shiftAt = (p: number) =>
  Math.abs((targetXAt(p) - eyeXAt(p)) - (targetXAt(0) - eyeXAt(0)));

/** 読みが立つ最小のずれ [px]。これを切るあいだは基線が開いていない。 */
export const MIN_SHIFT = 0.5;

/**
 * 基線長とずれ角から標的の深度を復元する。d = f·B/θ − f。
 *
 * f·B/θ は視点から標的までの距離なので、f を引くと画面より奥の深度になる。
 * 基線が開くまで（B = 0, Δθ = 0）は本当に未定義で、null を返す。
 */
export const recoveredDepth = (B: number, shift: number): number | null =>
  shift > MIN_SHIFT ? (EYE_Z * B) / shift - EYE_Z : null;

/** 行程 p での読み値一式。実験側はこれを整形するだけ。 */
export const readingAt = (p: number) => {
  const B = baselineAt(p);
  const shift = shiftAt(p);
  return { B, shift, depth: recoveredDepth(B, shift) };
};
