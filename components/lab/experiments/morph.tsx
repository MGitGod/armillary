import React from 'react';
import { polygonPath, ringPoints } from '../../../lib/curves';
import type { Experiment } from '../../../lib/lab';

const R = 210;
const SIDES = [3, 4, 5, 6, 8, 12, 60];

/**
 * 正 n 角形を渡り歩く。
 *
 * MorphSVG は頂点数が揃っていないと形が暴れるので、
 * curves.ts 側で全形状を同じ点数（辺上の等間隔サンプル）で生成している。
 * 数を増やしていくと最後は円に収束する、という当たり前を目で見る実験。
 */
export const morph: Experiment = {
  id: 'morph',
  title: 'Convergence',
  tech: ['MorphSVG', '等間隔サンプリング'],
  note: '辺を増やすと円に収束する。頂点数を揃えないとモーフは暴れる。',
  length: 2.4,

  render: () => (
    <svg
      viewBox="-260 -260 520 520"
      className="h-full max-h-[78vh] w-auto"
      style={{ color: 'white' }}
    >
      {/* 外接円と頂点の目安 */}
      <circle r={R} fill="none" stroke="currentColor" strokeWidth={0.4} opacity={0.22} />
      <g className="morph-marks">
        {ringPoints(60, R).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={1} fill="currentColor" opacity={0.25} />
        ))}
      </g>

      <path
        className="morph-shape"
        d={polygonPath(3, R)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
      />

      {/* 各形状の到達点を隠して置いておき、MorphSVG の行き先に使う */}
      <g className="morph-targets" style={{ display: 'none' }}>
        {SIDES.map((n) => (
          <path key={n} data-sides={n} d={polygonPath(n, R)} />
        ))}
      </g>

      <text
        className="morph-readout"
        x={0}
        y={246}
        textAnchor="middle"
        fontSize={11}
        fill="currentColor"
        opacity={0.5}
        style={{ fontFamily: 'var(--font-martian), ui-monospace, monospace' }}
      >
        n = 3
      </text>
    </svg>
  ),

  build: (tl, root) => {
    const shape = root.querySelector<SVGPathElement>('.morph-shape');
    const readout = root.querySelector<SVGTextElement>('.morph-readout');
    const marks = root.querySelector<SVGGElement>('.morph-marks');
    if (!shape) return;

    if (marks) tl.from(marks, { opacity: 0, duration: 0.2, ease: 'none' }, 0);
    tl.from(shape, { drawSVG: '0%', duration: 0.5, ease: 'none' }, 0);

    // 3 → 4 → 5 → … → 60（ほぼ円）へ順に乗り換える
    SIDES.slice(1).forEach((n, i) => {
      tl.to(
        shape,
        {
          morphSVG: { shape: polygonPath(n, R) },
          duration: 0.42,
          ease: 'power2.inOut',
          onStart: () => {
            if (readout) readout.textContent = `n = ${n}`;
          },
          onReverseComplete: () => {
            if (readout) readout.textContent = `n = ${SIDES[i]}`;
          },
        },
        0.6 + i * 0.42,
      );
    });

    // 収束したところで外接円を強調する
    tl.to(shape, { strokeWidth: 0.8, opacity: 0.7, duration: 0.3, ease: 'none' });
  },
};
