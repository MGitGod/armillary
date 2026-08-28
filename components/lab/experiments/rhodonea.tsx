import React from 'react';
import { rosePath } from '../../../lib/curves';
import type { Experiment } from '../../../lib/lab';

const R = 230;

/**
 * バラ曲線 r = R·cos(kθ)。
 *
 * 前半は DrawSVG で作図し、後半はスクロールがそのまま k のつまみになる。
 * k が整数を通過する瞬間だけ図形が閉じるので、
 * スクロールを送るとリズムを持って形が決まったり崩れたりする。
 */
export const rhodonea: Experiment = {
  id: 'rhodonea',
  title: 'Rhodonea',
  tech: ['DrawSVG', '三角関数'],
  note: 'r = cos(kθ)。スクロールが k のつまみになる。整数を通る瞬間だけ図形が閉じる。',
  length: 2.6,

  render: () => (
    <svg
      viewBox="-260 -260 520 520"
      className="h-full max-h-[78vh] w-auto"
      style={{ color: 'white' }}
    >
      {/* 作図の下地。方位線と外周。 */}
      <g className="rose-grid" opacity={0.18}>
        {Array.from({ length: 24 }).map((_, i) => (
          <line
            key={i}
            x1={0}
            y1={0}
            x2={0}
            y2={-248}
            transform={`rotate(${(i / 24) * 360})`}
            stroke="currentColor"
            strokeWidth={0.4}
          />
        ))}
        <circle r={248} fill="none" stroke="currentColor" strokeWidth={0.5} />
        <circle r={R} fill="none" stroke="currentColor" strokeWidth={0.4} />
      </g>

      <path
        className="rose-curve"
        // 周回数は build() の onUpdate と必ず揃える。
        // 揃っていないと、最初にタイムラインが動いた瞬間に曲線の解像度が飛ぶ。
        d={rosePath(2, R, 900, 4)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.1}
      />

      <text
        className="rose-readout"
        x={0}
        y={244}
        textAnchor="middle"
        fontSize={11}
        fill="currentColor"
        opacity={0.5}
        style={{ fontFamily: 'var(--font-martian), ui-monospace, monospace' }}
      >
        k = 2.00
      </text>
    </svg>
  ),

  build: (tl, root) => {
    const curve = root.querySelector<SVGPathElement>('.rose-curve');
    const grid = root.querySelector<SVGGElement>('.rose-grid');
    const readout = root.querySelector<SVGTextElement>('.rose-readout');
    if (!curve) return;

    // 第 1 幕: 下地と曲線を作図する
    if (grid) tl.from(grid, { opacity: 0, duration: 0.25, ease: 'none' }, 0);
    tl.from(curve, { drawSVG: '0%', duration: 0.7, ease: 'none' }, 0.1);

    // 第 2 幕: k を掃引する。スクロール量がそのまま k になる。
    const knob = { k: 2 };
    tl.to(
      knob,
      {
        k: 9,
        duration: 2,
        ease: 'none',
        onUpdate: () => {
          // 分数の k でも閉じるよう、周回数を多めに取る
          curve.setAttribute('d', rosePath(knob.k, R, 900, 4));
          if (readout) readout.textContent = `k = ${knob.k.toFixed(2)}`;
        },
      },
      0.8,
    );
  },
};
