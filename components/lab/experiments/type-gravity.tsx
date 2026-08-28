import React from 'react';
import { SplitText } from '../../../lib/gsap-config';
import type { Experiment } from '../../../lib/lab';

/**
 * 文字に質量を与える。
 * Physics2D は progress の決定的な関数なので、scrub すれば逆再生でも
 * 崩落がそのまま巻き戻る。「手で崩して、手で戻す」が成立する。
 */
export const typeGravity: Experiment = {
  id: 'type-gravity',
  title: 'Type Gravity',
  tech: ['SplitText', 'Physics2D'],
  note: '文字に質量を与えると、組版は崩落になる。スクロールを戻せば積み直る。',
  length: 2,

  render: () => (
    <div className="w-full text-center">
      <h2
        className="lab-type font-bold leading-none tracking-tighter"
        style={{ fontSize: 'clamp(3rem, 13vw, 11rem)' }}
      >
        GRAVITY
      </h2>
      <p className="lab-type-sub mt-6 font-mono text-[11px] tracking-[0.3em] text-white/30">
        9.80665 m/s²
      </p>
    </div>
  ),

  build: (tl, root) => {
    const heading = root.querySelector<HTMLElement>('.lab-type');
    const sub = root.querySelector<HTMLElement>('.lab-type-sub');
    if (!heading) return;

    const split = new SplitText(heading, { type: 'chars' });

    // 中央から外へ向かって落ち始める。端の文字ほど遅れて落ちる。
    tl.to(split.chars, {
      duration: 1,
      ease: 'none',
      physics2D: {
        velocity: 'random(40, 180)',
        angle: 'random(75, 105)',
        gravity: 900,
      },
      rotation: 'random(-140, 140)',
      stagger: { each: 0.05, from: 'center' },
    });

    if (sub) {
      tl.to(sub, { opacity: 0, y: 40, duration: 0.4, ease: 'none' }, 0.2);
    }

    // SplitText は DOM を作り替えるので、外されるときに戻す
    return () => split.revert();
  },
};
