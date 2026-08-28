"use client";
import React, { useEffect, useRef } from 'react';
import { gsap } from '../../../lib/gsap-config';
import {
  fibonacciSphere,
  rotateX,
  rotateY,
  tangentBasis,
  project,
  normalize,
  dot,
  add,
  scale as vscale,
  type Vec3,
} from '../../../lib/sphere';
import { CurtainLayer } from '../../../lib/curtain-core';
import type { Experiment } from '../../../lib/lab';

const COUNT = 260;
/** 小さいほど遠近が強い。球の奥行きが出る程度に。 */
const FOCAL = 640;
/** 左上手前からの光。表裏の濃さの差はここから出る。 */
const LIGHT = normalize({ x: -0.45, y: 0.65, z: 0.62 });

// --- カーソル反発 ---
const REPEL_RADIUS = 165;
const REPEL_FORCE = 4.2;
/** 元の位置へ戻そうとするばね定数。 */
const SPRING = 0.05;
/** 速度の減衰。1 に近いほど長く揺れ続ける。 */
const DAMPING = 0.87;

type Sheet = {
  /** 単位球面上の位置。形の基準。 */
  base: Vec3;
  size: number;
  /** 個体ごとの呼吸と翻りの位相・周期 */
  phase: number;
  freq: number;
  /** 面内の回転 */
  spin0: number;
  spinRate: number;
  /** 法線の揺らぎの強さ＝紙のはためき */
  flutter: number;
  /** 反発による画面座標上の変位と速度 */
  ox: number;
  oy: number;
  vx: number;
  vy: number;
};

const makeSheets = (): Sheet[] =>
  fibonacciSphere(COUNT).map((base) => ({
    base,
    size: 16 + Math.random() * 10,
    phase: Math.random() * Math.PI * 2,
    freq: 0.35 + Math.random() * 0.5,
    spin0: Math.random() * Math.PI * 2,
    spinRate: (Math.random() - 0.5) * 0.35,
    flutter: 0.12 + Math.random() * 0.22,
    ox: 0,
    oy: 0,
    vx: 0,
    vy: 0,
  }));

/**
 * 紙の鱗で覆われた球体。
 *
 * THREE.js は使わず、Canvas 2D に自前で投影している。
 * 塗りつぶした四角なので WebGL の細線問題は関係ないが、260 枚のために
 * 600KB の依存を足す理由も無い。奥行き順の描画と表裏の陰影を自分で持てるほうが
 * この絵は組み立てやすい。
 *
 * 形の維持と揺らぎの両立は、位置を毎フレーム積分せず
 * 「単位球面上の基準点」から都度組み立てることで実現している。
 * 誤差が蓄積しないので、いくら揺らしても球が崩れない。
 * 反発だけは画面座標上の変位として持ち、ばねで基準へ戻す。
 */
function PaperSphereStage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sheets = makeSheets();
    const pointer = { x: 0, y: 0, active: false };

    const resize = () => {
      // 高 DPI で紙の縁がぼやけないように実ピクセルで持つ
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const render = (t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;

      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.33;

      // 球全体のゆらぎ。等速回転にすると機械的なので、
      // 周期の違う波を重ねて「ふわふわ」させる。
      const ay = t * 0.15 + Math.sin(t * 0.29) * 0.14;
      const ax = Math.sin(t * 0.21) * 0.2 + CurtainLayer.drift(t) * 1.6;

      const items = sheets.map((s) => {
        // 個体の呼吸。半径方向にわずかに出入りする。
        const breath = 1 + Math.sin(t * s.freq + s.phase) * 0.05;
        const pos = rotateX(rotateY(vscale(s.base, R * breath), ay), ax);

        // 法線は基準点の向き ＋ 個体ごとのはためき
        const n = normalize(
          add(rotateX(rotateY(s.base, ay), ax), {
            x: Math.sin(t * s.freq * 1.7 + s.phase) * s.flutter,
            y: Math.cos(t * s.freq * 1.3 + s.phase * 1.6) * s.flutter,
            z: Math.sin(t * s.freq * 1.1 + s.phase * 0.7) * s.flutter,
          }),
        );

        // 紙の 2 辺。面内で回して向きをばらす。
        const { u, v } = tangentBasis(n);
        const spin = s.spin0 + t * s.spinRate;
        const c = Math.cos(spin);
        const sn = Math.sin(spin);
        const e1 = add(vscale(u, c), vscale(v, sn));
        const e2 = add(vscale(u, -sn), vscale(v, c));

        const p = project(pos, FOCAL);
        let px = cx + p.x;
        let py = cy - p.y; // 画面は下が正

        // --- カーソル反発 ---
        // 画面座標で力を計算し、変位をばねで基準へ戻す（減衰つき）。
        if (pointer.active) {
          const dx = px + s.ox - pointer.x;
          const dy = py + s.oy - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d < REPEL_RADIUS && d > 0.01) {
            const f = (1 - d / REPEL_RADIUS) ** 2 * REPEL_FORCE;
            s.vx += (dx / d) * f;
            s.vy += (dy / d) * f;
          }
        }
        s.vx = (s.vx - s.ox * SPRING) * DAMPING;
        s.vy = (s.vy - s.oy * SPRING) * DAMPING;
        s.ox += s.vx;
        s.oy += s.vy;
        px += s.ox;
        py += s.oy;

        return { s, px, py, n, half: s.size * p.k * 0.5, e1, e2, depth: pos.z, r: R };
      });

      // 奥から描く（画家のアルゴリズム）
      items.sort((a, b) => a.depth - b.depth);

      for (const it of items) {
        const { n, e1, e2, half, px, py } = it;
        const isFront = n.z > 0;
        // 裏を見ているときは、光を受けているのは反対側の面
        const lit = isFront ? n : { x: -n.x, y: -n.y, z: -n.z };
        const lam = Math.max(0, dot(lit, LIGHT));
        // 奥のものほど暗く沈める
        const depthFade = 0.55 + 0.45 * ((it.depth / it.r + 1) / 2);
        const alpha = (isFront ? 0.26 + lam * 0.6 : 0.06 + lam * 0.16) * depthFade;

        ctx.beginPath();
        ctx.moveTo(px + (e1.x + e2.x) * half, py - (e1.y + e2.y) * half);
        ctx.lineTo(px + (e1.x - e2.x) * half, py - (e1.y - e2.y) * half);
        ctx.lineTo(px - (e1.x + e2.x) * half, py + (e1.y + e2.y) * half);
        ctx.lineTo(px - (e1.x - e2.x) * half, py + (e1.y - e2.y) * half);
        ctx.closePath();

        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fill();
        // 縁を一段明るくすると紙の厚みが出る
        ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.85).toFixed(3)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) render(0);
    });
    ro.observe(canvas);
    resize();

    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);

    let elapsed = 0;
    const tick = (_time: number, delta: number) => {
      elapsed += Math.min(delta, 50) / 1000;
      render(elapsed);
    };

    // ticker の初回を待つと 1 フレーム空白になるので、まず即座に描く。
    render(0);
    if (!reduced) gsap.ticker.add(tick);

    // 開発時のみ、コマ送りとカーソル位置をコンソールから触れるようにする。
    // アニメーションは実際に動かさないと詰められないので。
    if (process.env.NODE_ENV !== 'production') {
      Object.assign(window as unknown as Record<string, unknown>, {
        paperSphere: {
          step: (time: number) => render(time),
          setPointer: (x: number, y: number) => {
            pointer.x = x;
            pointer.y = y;
            pointer.active = true;
          },
          clearPointer: () => {
            pointer.active = false;
          },
          sheets,
        },
      });
    }

    return () => {
      ro.disconnect();
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      gsap.ticker.remove(tick);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      // touch-none は付けない。ここはドラッグしないので不要な上、
      // 画面いっぱいの要素に付けるとタッチでスクロールできなくなる。
      className="relative aspect-square w-full max-w-[min(90vw,74vh)]"
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

export const paperSphere: Experiment = {
  id: 'paper-sphere',
  title: 'Paper Sphere',
  tech: ['Canvas 2D', 'フィボナッチ球', '反発ばね'],
  note: '紙の鱗で覆われた球。表裏で濃さが違い、カーソルを避けて戻る。',
  pin: false,
  Component: PaperSphereStage,
};
