/**
 * @file curtain-core.ts
 * @description 「カーテン」の核心となる「重なり（Layered Depth）」と「数理」の統合。
 *
 * 単純なフェードや平坦な移行を排し、
 * 物理的な質量と、数理的な揺らぎ（Sine/Cosineの重なり）を伴う
 * 「重厚な奥行き」を構築する。
 */

// --- 重層的な奥行きの定義 ---
// 遷移において、前のレイヤーが「重なり」の中で奥へと沈む動き。
// 次のレイヤーが「重なり」の隙間から現れる。
export const CurtainLayer = {
  // 揺らぎのベース（心臓の鼓動のような、微細な呼吸）
  pulse: (t: number) => Math.sin(t * 1.5) * 0.02,

  // 幾何学的な揺らぎ（数理による「厚み」の表現）
  // 単純な揺らぎではなく、複数の周波数を重ねることで「芯」を保つ。
  drift: (t: number) => {
    const d1 = Math.sin(t * 0.8) * 0.03;
    const d2 = Math.cos(t * 1.2) * 0.02;
    return d1 + d2;
  },

  // 数理による重厚な減衰（Custom Ease）
  // 物理的な摩擦を想起させる、ゆっくりと沈み込む加速。
  //
  // 立ち上がりの加速を抑制し、到達直前の「残響」を長く残す。
  // 3 次の立ち上がりと 5 次の減速を t でブレンドしており、
  // f(0) === 0 / f(1) === 1、かつ両端の速度が 0 になる。
  heavyEase: (t: number) =>
    (1 - t) * Math.pow(t, 3) + t * (1 - Math.pow(1 - t, 5)),
};

/**
 * **重厚なタイポグラフィの芯**
 * 文字の「重さ」と「質感」を保つための変位生成。
 *
 * @param intensity 揺らぎの強さ
 * @param now 評価時刻（ミリ秒）。既定は現在時刻。テスト時は固定値を渡す。
 */
export const senseOfScale = (intensity: number, now: number = Date.now()) => {
  // スケールに「奥行き」の概念を導入。
  // 常に一定ではなく、数理的に微細に波打つことで、「呼吸」を表現。
  return 1 + Math.sin(now * 0.001) * 0.01 * intensity;
};
