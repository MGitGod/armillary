import React from 'react';
import { lissajousPath } from '../../../lib/curves';
import type { Experiment } from '../../../lib/lab';

const R = 220;
const LAYERS = 3;

/**
 * リサージュ曲線 x = sin(a·t + δ), y = sin(b·t)。
 *
 * 位相 δ をずらした 3 本を重ね、b をスクロールで掃引する。
 * a:b が単純な整数比のとき図形が閉じて静止し、
 * 比が崩れると図形が回転しているように見える。止まって見える瞬間を探す実験。
 */
export const lissajous: Experiment = {
  id: 'lissajous',
  title: 'Lissajous',
  tech: ['三角関数', '位相差'],
  note: 'x=sin(at+δ), y=sin(bt)。a:b が整数比になった瞬間だけ図形が静止する。',
  length: 2.6,

  render: () => (
    <svg
      viewBox="-260 -260 520 520"
      className="h-full max-h-[78vh] w-auto"
      style={{ color: 'white' }}
    >
      <rect
        x={-R}
        y={-R}
        width={R * 2}
        height={R * 2}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.4}
        opacity={0.2}
      />
      {Array.from({ length: LAYERS }).map((_, i) => (
        <path
          key={i}
          className="liss-curve"
          data-layer={i}
          d={lissajousPath(3, 2, (i * Math.PI) / 6, R, 480)}
          fill="none"
          stroke="currentColor"
          strokeWidth={i === 0 ? 1.1 : 0.6}
          opacity={i === 0 ? 0.9 : 0.34}
        />
      ))}
      <text
        className="liss-readout"
        x={0}
        y={248}
        textAnchor="middle"
        fontSize={11}
        fill="currentColor"
        opacity={0.5}
        style={{ fontFamily: 'var(--font-martian), ui-monospace, monospace' }}
      >
        a:b = 3.00 : 2.00
      </text>
    </svg>
  ),

  build: (tl, root) => {
    const curves = [...root.querySelectorAll<SVGPathElement>('.liss-curve')];
    const readout = root.querySelector<SVGTextElement>('.liss-readout');
    if (curves.length === 0) return;

    const knob = { b: 2 };
    const A = 3;

    const redraw = () => {
      curves.forEach((el, i) => {
        el.setAttribute(
          'd',
          lissajousPath(A, knob.b, (i * Math.PI) / 6, R, 480),
        );
      });
      if (readout) {
        readout.textContent = `a:b = ${A.toFixed(2)} : ${knob.b.toFixed(2)}`;
      }
    };

    tl.from(curves, { drawSVG: '0%', duration: 0.6, stagger: 0.12, ease: 'none' }, 0);
    tl.to(knob, { b: 8, duration: 2, ease: 'none', onUpdate: redraw }, 0.7);
  },
};
