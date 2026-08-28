/**
 * @file ornament-motion.ts
 * @description 飾りの動きを決める数理。純粋関数だけ（DOM も GSAP も持たない）。
 *
 * 設計の骨:
 *   平常時のドリフトとスクロール時の活性化を、別々の仕組みにしない。
 *   「時刻の進む速さ」をエネルギーで変えるだけにする。
 *
 *     t += dt × rateOf(energy)
 *
 *   停止時は実時間の 1 倍でほとんど動いて見えない（知覚以下のドリフト）。
 *   スクロール中は最大 13 倍まで上がり、止めると慣性で減衰して静まる。
 *   飾りは t を読むだけでよく、スクロールのことを知らなくていい。
 */

/** 平常時の進む速さ（実時間の倍率）。 */
export const REST_RATE = 1;
/** エネルギー全開で何倍まで上がるか。 */
export const BOOST = 12;
/** この速度(px/s)で頭打ち。これ以上速くスクロールしても変わらない。 */
export const MAX_VELOCITY = 2600;
/** 立ち上がりは速く、収まりは遅く。これが慣性の感触を作る。 */
export const ATTACK = 0.18;
export const RELEASE = 0.035;

/**
 * 次フレームのエネルギー(0..1)。
 * 向きは問わない（上下どちらのスクロールでも同じだけ活性化する）。
 */
export const nextEnergy = (energy: number, velocity: number): number => {
  const target = Math.min(1, Math.abs(velocity) / MAX_VELOCITY);
  return energy + (target - energy) * (target > energy ? ATTACK : RELEASE);
};

/** エネルギーから時刻の進む速さ。 */
export const rateOf = (energy: number) => REST_RATE + energy * BOOST;
