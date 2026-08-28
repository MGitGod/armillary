import { gsap } from './gsap-config';
import { nextEnergy, rateOf } from './ornament-motion';

/**
 * @file ornament-clock.ts
 * @description ページ上の飾りが共有する 1 本の時計。
 *
 * 動きの数理は ornament-motion.ts（純粋関数）。ここは機械部分だけを持つ。
 *
 * ticker は 1 本しか回さない。飾りが何個あっても rAF は 1 つで、
 * 飾りどうしの位相も自動的に揃う（別々のウィジェットではなく
 * 一つの機械の部品に見える、というのがこの設計の狙い）。
 *
 * 画面内に飾りが 1 つも無ければ ticker ごと止める。
 * prefers-reduced-motion では最初から動かさない（静止画として成立させる）。
 */

export type OrnamentTick = (t: number, energy: number) => void;

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const subscribers = new Set<OrnamentTick>();
let t = 0;
let energy = 0;
let visibleCount = 0;
let running = false;
let lastY = 0;

const tick = (_time: number, delta: number) => {
  // タブから戻った直後の巨大な delta で時刻が飛ぶのを防ぐ
  const dt = Math.min(delta, 50) / 1000;

  const y = window.scrollY;
  const velocity = dt > 0 ? (y - lastY) / dt : 0;
  lastY = y;

  energy = nextEnergy(energy, velocity);
  t += dt * rateOf(energy);

  subscribers.forEach((fn) => fn(t, energy));
};

const sync = () => {
  const should = subscribers.size > 0 && visibleCount > 0 && !prefersReducedMotion();
  if (should && !running) {
    running = true;
    lastY = window.scrollY;
    gsap.ticker.add(tick);
  } else if (!should && running) {
    running = false;
    gsap.ticker.remove(tick);
  }
};

export type OrnamentHandle = {
  /** 画面内に入っているか。全部 false になれば時計ごと止まる。 */
  setVisible: (v: boolean) => void;
  stop: () => void;
};

export const subscribe = (fn: OrnamentTick): OrnamentHandle => {
  subscribers.add(fn);
  let visible = false;

  return {
    setVisible: (v: boolean) => {
      if (v === visible) return;
      visible = v;
      visibleCount += v ? 1 : -1;
      sync();
    },
    stop: () => {
      if (visible) {
        visible = false;
        visibleCount -= 1;
      }
      subscribers.delete(fn);
      sync();
    },
  };
};

/** 開発時の確認用。 */
const inspect = () => ({ t, energy, running, subscribers: subscribers.size, visibleCount });

/**
 * rAF が動かない環境（描画されていないタブ等）で、
 * 時計を手で進めて挙動を確かめるための口。開発時のみ。
 */
const pump = (steps: number, velocity: number) => {
  for (let i = 0; i < steps; i++) {
    energy = nextEnergy(energy, velocity);
    t += (1 / 60) * rateOf(energy);
  }
  subscribers.forEach((fn) => fn(t, energy));
  return inspect();
};

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  Object.assign(window as unknown as Record<string, unknown>, {
    ornamentClock: { inspect, pump },
  });
}
