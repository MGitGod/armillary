import React from 'react';
import { gsap } from '../../../lib/gsap-config';
import type { Experiment } from '../../../lib/lab';

const SLATS = 14;

/**
 * シャッター。
 *
 * 調べて分かった定石は 2 つの組み合わせ:
 *   1. stagger の from: 'center' で中央から外へ開く
 *   2. gsap.utils.wrap([...]) で羽根の向きを 1 枚おきに反転させる
 * この 2 つで、順番に開くのではなく「噛み合っていたものが解ける」動きになる。
 *
 * 羽根の位置は flex: 1 に任せて数値を一切書かない。
 * 座標を計算して style に入れるとハイドレーションの不一致源になるので、
 * レイアウトで済むものはレイアウトで済ませる。
 */
export const shutter: Experiment = {
  id: 'shutter',
  title: 'Shutter',
  tech: ['stagger(from:center)', 'utils.wrap'],
  note: '中央から外へ、1 枚おきに逆向き。順に開くのではなく噛み合いが解ける。',
  length: 2.2,

  render: () => (
    <div className="relative aspect-[16/10] w-full max-w-4xl overflow-hidden border border-white/15">
      {/* 羽根の背後。開くと出てくる面。 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <svg viewBox="-120 -120 240 240" className="absolute inset-0 h-full w-full opacity-30">
          {[36, 58, 80, 102].map((r) => (
            <circle
              key={r}
              r={r}
              fill="none"
              stroke="white"
              strokeWidth={0.6}
            />
          ))}
          <line x1={-120} y1={0} x2={120} y2={0} stroke="white" strokeWidth={0.4} />
          <line x1={0} y1={-120} x2={0} y2={120} stroke="white" strokeWidth={0.4} />
        </svg>

        <div className="shutter-plate relative text-center">
          <div
            className="font-bold leading-none tracking-tighter"
            style={{ fontSize: 'clamp(2.5rem, 9vw, 7rem)' }}
          >
            APERTURE
          </div>
          <div className="mt-3 font-mono text-[10px] tracking-[0.4em] text-white/40">
            {SLATS} SLATS · CENTRE-OUT
          </div>
        </div>
      </div>

      {/* 羽根。flex: 1 で等分するので座標を書かない。 */}
      <div className="shutter-slats absolute inset-0 flex">
        {Array.from({ length: SLATS }).map((_, i) => (
          <div
            key={i}
            className="slat h-full flex-1 border-r border-white/10 bg-black last:border-r-0"
            style={{
              backgroundImage:
                'linear-gradient(to bottom, rgba(255,255,255,0.10), rgba(255,255,255,0.02) 45%, rgba(255,255,255,0.08))',
            }}
          />
        ))}
      </div>
    </div>
  ),

  build: (tl, root) => {
    const slats = root.querySelectorAll<HTMLElement>('.slat');
    const plate = root.querySelector<HTMLElement>('.shutter-plate');
    if (slats.length === 0) return;

    tl.to(slats, {
      // 1 枚おきに上下へ逃がす。これが「噛み合いが解ける」感じを作る。
      yPercent: gsap.utils.wrap([-104, 104]),
      duration: 1,
      ease: 'power3.inOut',
      stagger: { each: 0.045, from: 'center' },
    });

    if (plate) {
      // 羽根が開ききる少し前から、中身がわずかに迫り出す
      tl.from(plate, { scale: 0.94, duration: 0.8, ease: 'power2.out' }, 0.35);
    }
  },
};
