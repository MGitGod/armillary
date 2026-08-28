import React from 'react';
import { gsap, SplitText } from '../../../lib/gsap-config';
import type { Experiment } from '../../../lib/lab';

/**
 * テキストのカーテン。
 *
 * SplitText 3.13 で mask オプションが入り、行ごとに overflow:hidden の
 * ラッパーを自動生成できるようになった（自前で二重に div を掘る必要がない）。
 * 行が「自分の枠の裏から」立ち上がるので、フェードではなく
 * 幕が上がる動きになる。カーテンのタイポグラフィ版。
 *
 * type に 'lines, chars' を指定して mask は 'lines' だけに掛ける。
 * 文字ごとにマスクを作ると DOM が跳ね上がるうえ、行の裏から出る絵にならない。
 */
export const maskedLines: Experiment = {
  id: 'masked-lines',
  title: 'Masked Lines',
  tech: ['SplitText(mask)', 'wrap'],
  note: '行が自分の枠の裏から立ち上がる。フェードではなく幕が上がる。',
  length: 2.4,

  render: () => (
    <div className="w-full max-w-3xl px-2">
      <div className="mb-8 font-mono text-[10px] tracking-[0.4em] text-white/30">
        TYPOGRAPHY AS CURTAIN
      </div>

      <h2
        className="masked-copy font-bold leading-[1.05] tracking-tight"
        style={{ fontSize: 'clamp(1.75rem, 5.2vw, 3.75rem)' }}
      >
        A line does not fade in. It rises from behind its own edge, and the edge
        is what makes the motion legible.
      </h2>

      <p className="masked-sub mt-10 max-w-xl font-mono text-[11px] leading-relaxed tracking-[0.15em] text-white/40">
        Masking is the whole trick. Without a clipping wrapper the same tween
        reads as a slide; with one, it reads as a reveal.
      </p>
    </div>
  ),

  build: (tl, root) => {
    const copy = root.querySelector<HTMLElement>('.masked-copy');
    const sub = root.querySelector<HTMLElement>('.masked-sub');
    if (!copy) return;

    // mask は 'lines' だけに掛ける。chars は後段の味付け用に分けておく。
    const split = SplitText.create(copy, { type: 'lines, chars', mask: 'lines' });
    const subSplit = sub
      ? SplitText.create(sub, { type: 'lines', mask: 'lines' })
      : null;

    tl.from(split.lines, {
      yPercent: 110,
      duration: 1,
      ease: 'power4.out',
      stagger: 0.14,
    });

    // 立ち上がったあと、文字を 1 つおきに逆方向へごく僅かにずらして
    // 「行が完全には揃いきっていない」質感を残す。
    tl.from(
      split.chars,
      {
        yPercent: gsap.utils.wrap([-14, 14]),
        opacity: 0.35,
        duration: 0.6,
        ease: 'power2.out',
        stagger: { each: 0.006, from: 'random' },
      },
      0.55,
    );

    if (subSplit) {
      tl.from(
        subSplit.lines,
        { yPercent: 110, duration: 0.8, ease: 'power4.out', stagger: 0.1 },
        0.9,
      );
    }

    return () => {
      split.revert();
      subSplit?.revert();
    };
  },
};
