/**
 * @file motion-core.ts
 * @description 量的な厚みを備えた数理ロジックの提供。
 *
 * 単純なイージング（Ease）を避け、物理的特性（質量、摩擦、重力）を
 * 数式によってシミュレートし、質感（Crafted感）を紡ぎ出す。
 *
 * ここで定義するイーズは全て f(0) === 0 / f(1) === 1 を満たす。
 * この保証がないと GSAP の progress に噛ませた瞬間に終端値が飛ぶ。
 */

/**
 * GSAP の `ease` にそのまま渡せる既製イーズ。
 *
 * 旧 motion-core.js は `slow(0.7, 0.8, false)` を指定していたが、
 * SlowMo は EasePack プラグイン側のイーズで gsap コアでは解決されず
 * （登録しても文字列形式は解決しない）、黙って既定イーズに
 * フォールバックしていた。意図に最も近いコアイーズへ置き換えている。
 */
export const EasePresets = {
  /** 重厚な加速（重みを感じる立ち上がり） */
  heavy: 'power3.in',
  /** 繊細な余韻（長く尾を引く減衰） */
  lingering: 'expo.out',
  /** 意思の介在（緩やかながらも確かな変化） */
  intentional: 'power2.inOut',
} as const;

/**
 * 重厚な溜め（Substantial Pause）を伴うカスタムイーズ。
 *
 * start 時にわずかな余韻を持ち、end に向けた減速を非常に長く、
 * しかし鋭く制御するもの。
 * 溜めを担う 4 次の立ち上がりと、長い減衰を担う 8 次の減速を
 * t で線形ブレンドすることで、両端の速度を 0 に落としている。
 *
 * @param t 0から1のプログレス
 * @returns 0から1の変形された値
 */
export const CraftEase = (t: number) =>
  (1 - t) * Math.pow(t, 4) + t * (1 - Math.pow(1 - t, 8));

/**
 * タイポグラフィーの「呼吸」を再現する。
 * 2つのサイン波を異なる周波数と振幅で重ねることで、
 * 一定の強迫感のない、有機的な揺らぎを生成する。
 *
 * @param time 経過時間（秒）
 * @returns 1 を中心に ±0.03 で揺れる倍率
 */
export const calculateBreathing = (time: number) => {
  const wave1 = Math.sin(time * 0.5) * 0.02;
  const wave2 = Math.sin(time * 1.2) * 0.01;
  return 1 + wave1 + wave2;
};

/**
 * 重力による減衰（Gravity Decay）。
 * 物理的な質量を持った物体が、空気の抵抗を受けながら動く様子をシミュレート。
 *
 * @param t 0から1のプログレス
 * @returns 0から1の変形された値
 */
export const Decay_Easing = (t: number) => 1 - Math.pow(1 - t, 4);
