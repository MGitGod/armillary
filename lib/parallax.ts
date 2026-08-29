/**
 * @file parallax.ts
 * @description 深度から見た目を導く写像。純粋関数だけを置く（DOM も描画も持たない）。
 *
 * 速度・ぼけ・彩度・コントラスト・スケールを別々に手で調整すると必ずずれる。
 * z ひとつを入力とする関数にして、そこから全部を導出する。
 *
 * 運動視差は単独では弱い単眼手がかりで、他と足し算して初めて効く
 * （両眼視差と併用すると 3D 構造の検出閾値が平均 48% 下がる: Royal Society, 2016）。
 * 「速度差だけでは奥行きにならない」がシリーズ全体の主張。
 */

export type DepthCues = {
  /** 移動量の倍率。1 = スクロールと等速。 */
  speed: number;
  /** ぼけ [px]。 */
  blur: number;
  saturate: number;
  contrast: number;
  scale: number;
};

/**
 * 深度 z ∈ [0,1]（0 = 手前, 1 = 奥）から手がかり一式を導く。
 *
 * gain は深度→速度の**傾き**。方向ではない。
 *   +1 正常（奥ほど遅い） / 0 奥行き消失（全層が一枚の板） / −1 反転（奥ほど速い）
 *
 * ここを `(1 - 0.72*z) * gain` と書くと、gain が負のとき全層の符号が反転して
 * シーンごと逆走する（区間の終わりに全部が画面外へ出る）。それは逆視差ではない。
 * 掛けるのは z のほうであって、式全体ではない。
 *
 * blur を z^1.6 にしているのは、線形だと手前側でぼけ始めるのが早すぎるため。
 * 1.0 / 1.6 / 2.2 を比べて 1.6 を採った（1.0 は近景が濁り、2.2 は奥が効かない）。
 */
export const depthCues = (z: number, gain = 1): DepthCues => ({
  speed: 1 - 0.72 * z * gain,
  blur: 3.2 * Math.pow(z, 1.6),
  saturate: 1 - 0.55 * z,
  contrast: 1 - 0.28 * z,
  scale: 1 + 0.06 * z,
});

/**
 * 手前の稜線が奥の稜線を追い越さない移動量の上限。
 *
 * 追い越すと風景が裏返って読めなくなる。ステージ高 S のとき稜線の高さは
 * `S − H − range·v` なので、手前が奥より上に行かない条件は
 *
 *     S − H_near − range·v_near  >  S − H_far − range·v_far
 *     ⟺  range  <  (H_far − H_near) / (v_near − v_far)
 *
 * S が消えるので、ステージ高には依存しない。
 * 寸法ごとに変わる値なので、数値を手で置かずここから取る。
 * safety は理論上限に対する余裕（見本帳では 132px の上限に対し 110px を採った）。
 */
export const maxTravel = (
  nearHeight: number,
  farHeight: number,
  nearSpeed: number,
  farSpeed: number,
  safety = 0.83,
) => {
  const dv = nearSpeed - farSpeed;
  if (dv <= 0) return Infinity;   // 速度差がなければ追い越しは起きない
  return Math.max(0, ((farHeight - nearHeight) / dv) * safety);
};

/**
 * スクロール速度による歪み。
 *
 * 定石は `velocity / -300`（係数 0.0033）を ±10〜20° でクランプするもの
 * （GSAP コミュニティの skew デモ）。深度を効かせようと
 * `clamp(v · k · (1+z), ±14°)` と書くと、**常用域で全層が上限に張り付いて
 * 深度差がちょうど消える**。実測 8,000 px/s で 4 層とも 8.2° になった。
 * 見せたいものが、見せたい場面でだけ消える。
 *
 * クランプ自体を深度依存にすると解ける。飽和しても順序が残る。
 */
export const velocitySkew = (velocity: number, z: number) => {
  const lim = 6 + 9 * z;
  const raw = velocity * 0.0022 * (1 + 1.6 * z);
  return Math.max(-lim, Math.min(lim, raw));
};

/** 深度ごとのばね剛性。奥ほど柔らかく、遅れて追いつく。 */
export const springStiffness = (z: number) => 26 - 17 * z;

export type Spring = { y: number; v: number };

/**
 * 臨界減衰ばねを 1 ステップ進める。減衰係数 2√k が臨界減衰の条件。
 * 速度を先に更新してから位置に使う（半陰的オイラー）。陽的だと発散しやすい。
 */
export const stepSpring = (s: Spring, target: number, z: number, dt: number): Spring => {
  const k = springStiffness(z);
  const a = k * (target - s.y) - 2 * Math.sqrt(k) * s.v;
  const v = s.v + a * dt;
  return { y: s.y + v * dt, v };
};

// ── 稜線 ────────────────────────────────────────────

export const RIDGE_W = 600;
/** 稜線を描く座標系の高さ。地面がここ。 */
export const RIDGE_VIEW_H = 300;
/** viewBox の実際の下端。地面よりさらに下へ延ばしてある。 */
export const RIDGE_FOOT = 700;

/**
 * 稜線 SVG の寸法。
 *
 * `bottom: 0` で置いて translateY で持ち上げると、SVG の下端とステージ下端の
 * 間に隙間が空く（塗りが尽きて背景が透ける）。静止画では見えず、スクロールして初めて出る。
 *
 * viewBox を下へ延長し、要素も同じ比率で伸ばして下端を画面外へ追い出す。
 * `preserveAspectRatio="none"` なので縦の倍率は `要素高 / viewBox 高` で決まり、
 * 3 つを揃えると倍率は延長前の `H/300` のまま変わらない
 * ＝ 稜線の位置と振幅は延長前と一致する。延長分が移動量の余裕になる。
 */
export const ridgeBox = (visibleHeight: number) => ({
  height: visibleHeight * (RIDGE_FOOT / RIDGE_VIEW_H),
  bottom: -visibleHeight * ((RIDGE_FOOT - RIDGE_VIEW_H) / RIDGE_VIEW_H),
  viewBox: `0 0 ${RIDGE_W} ${RIDGE_FOOT}`,
});

/**
 * 稜線のパス。正弦を 3 本重ねて作る。
 * 長いパスデータを手書きしない（既存 spec の方針）。周期の比を無理数寄りにして、
 * 折り返しが目立たないようにしてある。
 */
export const ridgePath = (phase: number, amp: number, base: number) => {
  let d = `M0 ${RIDGE_FOOT}L0 ${RIDGE_VIEW_H - base}`;
  for (let x = 0; x <= RIDGE_W; x += 12) {
    const y =
      RIDGE_VIEW_H -
      base -
      Math.sin(x / 118 + phase) * amp -
      Math.sin(x / 41 + phase * 2.1) * amp * 0.32 -
      Math.sin(x / 23 + phase * 0.7) * amp * 0.12;
    d += `L${x} ${y.toFixed(1)}`;
  }
  return d + `L${RIDGE_W} ${RIDGE_FOOT}Z`;
};

/** 4 層の既定値。手前ほど低く大きく、奥ほど高く薄い。 */
export const RIDGE_LAYERS = [0, 1, 2, 3].map((i) => {
  const z = i / 3;
  return {
    z,
    /** 見える高さ [px]。 */
    height: 150 + z * 95,
    phase: i * 2.7,
    amp: 46 - z * 16,
    base: 96 + z * 42,
  };
});
