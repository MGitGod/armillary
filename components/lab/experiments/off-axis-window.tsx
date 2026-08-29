"use client";
import React, { useEffect, useRef, useState } from 'react';
import type { Experiment } from '../../../lib/lab';
import {
  EYE_Z_RATIO,
  SHAFT_DEPTHS,
  SHAFT_HALF,
  projectNaive,
  projectOffAxis,
  shaftRings,
  type Eye,
  type Vec2,
} from '../../../lib/frustum';

const VIEW = 320;
const CENTRE = VIEW / 2;
const EYE_Z = VIEW * EYE_Z_RATIO;
const RINGS = shaftRings(SHAFT_HALF, SHAFT_DEPTHS);
const GNOMON_Z = -175;
const GNOMON_R = 34;

type Project = (p: { x: number; y: number; z: number }, eye: Eye) => Vec2;
type PanelRefs = {
  polys: SVGPolygonElement[];
  edges: SVGLineElement[];
  gnomon: SVGLineElement[];
  project: Project;
};

const pts = (ps: Vec2[]) =>
  ps.map((p) => `${(CENTRE + p.x).toFixed(1)},${(CENTRE + p.y).toFixed(1)}`).join(' ');

/** 片側のパネル。投影関数だけが違う。 */
function Panel({
  label, hot, project, refs,
}: {
  label: string;
  hot?: boolean;
  project: Project;
  refs: React.MutableRefObject<PanelRefs | null>;
}) {
  const root = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    refs.current = {
      polys: Array.from(svg.querySelectorAll('polygon')),
      edges: Array.from(svg.querySelectorAll('line.edge')),
      gnomon: Array.from(svg.querySelectorAll('line.gnomon')),
      project,
    };
  }, [project, refs]);

  return (
    <div className="relative flex-1">
      <span
        className={`absolute left-2.5 top-2 z-10 border border-white/10 bg-black/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${hot ? 'text-[rgb(224,82,58)]' : 'text-white/30'}`}
      >
        {label}
      </span>
      <svg ref={root} viewBox={`0 0 ${VIEW} ${VIEW}`} className="block w-full">
        {RINGS.map((_, i) => (
          <polygon
            key={i}
            fill="none"
            strokeWidth={i === 0 ? 1.4 : 1}
            stroke="currentColor"
            style={i === 0 ? { color: 'rgb(224 82 58)' } : undefined}
            className={i === 0 ? undefined : 'text-white/25'}
            opacity={i === 0 ? 1 : 1 - i * 0.11}
          />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <line key={i} className="edge text-white/15" stroke="currentColor" strokeWidth={0.7} />
        ))}
        {[0, 1].map((i) => (
          <line key={i} className="gnomon" stroke="currentColor" strokeWidth={1.2}
                style={{ color: 'rgb(224 82 58)' }} />
        ))}
      </svg>
    </div>
  );
}

/**
 * 覗き窓。
 *
 * A は層を深度に比例して平行移動しているだけ。奥の面は形を変えない。
 * B は視点位置からスクリーン平面へ光線を張り直しているので、奥の壁がせん断して
 * 手前の枠に隠れる ── 遮蔽と透視が同時に成立する。
 * 同じ立体・同じ視点入力で、違うのは投影だけ。
 *
 * 数学は光線とスクリーン平面の交点を取るだけで、これが Kooima の
 * generalized perspective projection と同じもの。行列を組まなくても 3 行で足りる。
 *
 * 点と線だけなら投影は自前で書けて、出力は 1px の正確な線になる。
 * WebGL の lineWidth がほぼ 1px 固定でアンチエイリアスも効かない問題を、そもそも踏まない。
 * 「THREE.js を使わない」という既存の判断が、奥行きを諦める理由にならないことの実証。
 *
 * 視点入力をポインタから webcam の頭部位置（MediaPipe Face Mesh）に差し替えると
 * 画面が本当に壁の穴になる。投影側のコードは一切変わらない。
 */
function OffAxisWindow() {
  const wrap = useRef<HTMLDivElement | null>(null);
  const a = useRef<PanelRefs | null>(null);
  const b = useRef<PanelRefs | null>(null);
  const [auto, setAuto] = useState(true);
  const eye = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const readout = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;

    // pin:false なので LabSection の reduced-motion 対応が効かない。自前で見る。
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let t0 = 0;
    let alive = true;

    const drawPanel = (p: PanelRefs | null, e: Eye) => {
      if (!p) return;
      const projected = RINGS.map((ring) => ring.map((v) => p.project(v, e)));
      p.polys.forEach((poly, i) => poly.setAttribute('points', pts(projected[i])));
      p.edges.forEach((line, i) => {
        const f = projected[0][i], k = projected[projected.length - 1][i];
        line.setAttribute('x1', String(CENTRE + f.x)); line.setAttribute('y1', String(CENTRE + f.y));
        line.setAttribute('x2', String(CENTRE + k.x)); line.setAttribute('y2', String(CENTRE + k.y));
      });
      const h = [{ x: -GNOMON_R, y: 0, z: GNOMON_Z }, { x: GNOMON_R, y: 0, z: GNOMON_Z }].map((v) => p.project(v, e));
      const v2 = [{ x: 0, y: -GNOMON_R, z: GNOMON_Z }, { x: 0, y: GNOMON_R, z: GNOMON_Z }].map((v) => p.project(v, e));
      const set = (line: SVGLineElement, s: Vec2, t: Vec2) => {
        line.setAttribute('x1', String(CENTRE + s.x)); line.setAttribute('y1', String(CENTRE + s.y));
        line.setAttribute('x2', String(CENTRE + t.x)); line.setAttribute('y2', String(CENTRE + t.y));
      };
      set(p.gnomon[0], h[0], h[1]);
      set(p.gnomon[1], v2[0], v2[1]);
    };

    const frame = (now: number) => {
      if (!alive) return;
      if (!t0) t0 = now;
      // 動きを減らす設定では、自動の首振りだけ止める。
      // ポインタへの応答は本人の操作なので残す（WCAG 2.3.3 はインタラクション由来の
      // アニメーションを「無効化できること」を求めるもので、操作そのものは禁じない）。
      if (auto && !reduce.matches) {
        const t = (now - t0) / 1000;
        eye.current.tx = Math.sin(t * 0.72) * 82;
        eye.current.ty = Math.sin(t * 0.47) * 42;
      }
      eye.current.x += (eye.current.tx - eye.current.x) * 0.1;
      eye.current.y += (eye.current.ty - eye.current.y) * 0.1;
      const e: Eye = { x: eye.current.x, y: eye.current.y, z: EYE_Z };
      drawPanel(a.current, e);
      drawPanel(b.current, e);
      if (readout.current) {
        readout.current.textContent = `eye = (${e.x.toFixed(0)}, ${e.y.toFixed(0)}, ${EYE_Z.toFixed(0)})`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onMove = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      setAuto(false);
      eye.current.tx = ((ev.clientX - r.left) / r.width - 0.5) * 190;
      eye.current.ty = ((ev.clientY - r.top) / r.height - 0.5) * 120;
    };
    const onLeave = () => { eye.current.tx = 0; eye.current.ty = 0; };
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [auto]);

  return (
    <div className="w-full max-w-4xl">
      <div ref={wrap} className="flex gap-px border border-white/15 bg-white/15">
        <Panel label="A ／ 平行移動（よくある実装）"
               project={(p, e) => projectNaive(p, e)} refs={a} />
        <Panel label="B ／ 非対称視錐台（正しい投影）" hot
               project={projectOffAxis} refs={b} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-white/40">
        <button
          type="button"
          onClick={() => setAuto((v) => !v)}
          aria-pressed={auto}
          className="rounded-sm border border-white/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] transition-colors hover:border-white/40 hover:text-white/80 aria-pressed:border-transparent aria-pressed:bg-white/85 aria-pressed:text-black"
        >
          自動で首を振る
        </button>
        <span ref={readout} />
        <span className="text-white/25">同じ立体・同じ視点入力。違うのは投影だけ</span>
      </div>
    </div>
  );
}

export const offAxisWindow: Experiment = {
  id: 'off-axis-window',
  title: 'Off-axis Window',
  tech: ['非対称視錐台', 'SVG 自前投影'],
  note: '平行移動と正しい投影を並置する。奥の壁がせん断して初めて、穴を覗いている感じになる。',
  pin: false,
  Component: OffAxisWindow,
};
