/**
 * @file frustum.ts
 * @description 非対称視錐台（off-axis perspective）。純粋関数だけを置く。
 *
 * ビューポートを壁に空いた穴として扱うための投影。
 * Kooima の generalized perspective projection と同じものだが、
 * 射影行列を組む必要はない ── 視点からスクリーン平面（z=0）へ光線を張り直して
 * 交点を取るだけで足りる。
 *
 * 点と線だけなら投影は自前で書けて、出力は 1px の正確な線になる。
 * WebGL の lineWidth が実質 1px 固定でアンチエイリアスも効かない問題を、
 * そもそも踏まない（既存 spec の「THREE.js を使わない」判断の実証）。
 */

export type Vec3 = { x: number; y: number; z: number };
export type Vec2 = { x: number; y: number };
/** 視点。z > 0 が画面の手前側。 */
export type Eye = Vec3;

/** 視点距離 ez をステージ幅の何倍に取るか。 */
export const EYE_Z_RATIO = 1.30;

/**
 * 非対称視錐台。視点 eye から点 p へ引いた光線が、スクリーン平面 z=0 と
 * 交わる位置を返す。
 *
 *   t  = ez / (ez − pz)
 *   s  = eye + (p − eye)·t
 *
 * pz = 0 なら t = 1 で p がそのまま返る（スクリーン平面上の点は動かない）。
 * pz → −∞ で t → 0、投影点は視点のスクリーン座標へ収束する（消失点）。
 *
 * **前提: pz < eye.z。** pz = eye.z（点が視点と同じ平面）で分母が 0 になり発散する。
 * 呼び出し元はすべて画面の奥（pz ≤ 0）の点を渡し、eye.z は正なので到達しない。
 * 実行時の分岐は置かない ── 到達したらそれは呼び出し側の座標系の誤りで、
 * 黙って丸めるより発散したほうが見つけやすい。
 */
export const projectOffAxis = (p: Vec3, eye: Eye): Vec2 => {
  const t = eye.z / (eye.z - p.z);
  return { x: eye.x + (p.x - eye.x) * t, y: eye.y + (p.y - eye.y) * t };
};

/**
 * 比較用。よくある「パララックス」の実装 ── 深度に比例した平行移動。
 *
 * 割り算が無いので透視短縮が起きず、奥の面は形を変えない（剛体移動）。
 * 動いてはいるが、穴を覗いている感じにはならない。
 * この 1 行の差が「動いている」と「覗いている」を分ける。
 */
export const projectNaive = (p: Vec3, eye: Eye, depthScale = 350): Vec2 => ({
  x: p.x + eye.x * (-p.z / depthScale),
  y: p.y + eye.y * (-p.z / depthScale),
});

/** 覗き込むシャフトの断面の半分の辺長。 */
export const SHAFT_HALF = 96;
/** 断面を置く深度。手前面はスクリーン平面上に置く。 */
export const SHAFT_DEPTHS = [0, -70, -140, -210, -280, -350];

/** 各深度の 4 隅。左上→右上→右下→左下の順（polygon にそのまま流せる）。 */
export const shaftRings = (half: number, depths: number[]): Vec3[][] =>
  depths.map((z) => [
    { x: -half, y: -half, z },
    { x: half, y: -half, z },
    { x: half, y: half, z },
    { x: -half, y: half, z },
  ]);
