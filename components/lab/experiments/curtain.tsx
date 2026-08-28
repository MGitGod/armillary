import React from 'react';
import { CurtainLayer } from '../../../lib/curtain-core';
import type { Experiment } from '../../../lib/lab';

type Layer = { id: string; label: string; caption: string; tone: string; from: string };

/**
 * 多段カーテン。
 *
 * カーテンの本体は clip-path: inset() を scrub で開閉すること。
 * 4 辺の inset を別々に動かせるので、辺ごとに違う方向から拭える。
 * transform と違い、面そのものは動かずに「見える範囲」だけが変わるので、
 * 背後の層との位置関係が崩れない。これが多段レイヤーで効く。
 *
 * イーズは lib/curtain-core.ts の heavyEase。
 * このファイルは元々「カーテンの重なり」のために書かれていたので、
 * ようやく本来の用途で使われることになる。
 */

const LAYERS: Layer[] = [
  {
    id: 'l1',
    label: 'SURFACE',
    caption: '最初に触れる面',
    tone: 'rgba(255,255,255,0.06)',
    from: 'inset(0% 100% 0% 0%)', // 左から
  },
  {
    id: 'l2',
    label: 'STRUCTURE',
    caption: '面の下にある骨格',
    tone: 'rgba(255,255,255,0.10)',
    from: 'inset(100% 0% 0% 0%)', // 上から
  },
  {
    id: 'l3',
    label: 'INTENT',
    caption: 'なぜそう組んだか',
    tone: 'rgba(255,255,255,0.16)',
    from: 'inset(0% 0% 0% 100%)', // 右から
  },
  {
    id: 'l4',
    label: 'RESIDUE',
    caption: '見終えたあとに残るもの',
    tone: 'rgba(255,255,255,0.24)',
    from: 'inset(0% 0% 100% 0%)', // 下から
  },
];

export const curtain: Experiment = {
  id: 'curtain',
  title: 'Curtain',
  tech: ['clip-path: inset()', 'heavyEase'],
  note: '面は動かさず「見える範囲」だけを拭う。だから層の位置関係が崩れない。',
  length: 3,

  render: () => (
    <div className="relative aspect-[16/10] w-full max-w-4xl overflow-hidden border border-white/15">
      {LAYERS.map((l, i) => (
        <div
          key={l.id}
          className="curtain-layer absolute inset-0 flex flex-col items-center justify-center"
          data-layer={i}
          style={{ clipPath: l.from, background: l.tone }}
        >
          {/* 層ごとに罫の密度を変えて、重なっているのが分かるようにする */}
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: `repeating-linear-gradient(${i * 45}deg, rgba(255,255,255,0.10) 0 1px, transparent 1px ${8 + i * 6}px)`,
            }}
          />
          <div className="relative text-center">
            <div className="mb-3 font-mono text-[10px] tracking-[0.4em] text-white/40">
              LAYER {String(i + 1).padStart(2, '0')}
            </div>
            <div
              className="font-bold leading-none tracking-tighter"
              style={{ fontSize: 'clamp(2rem, 7vw, 5rem)' }}
            >
              {l.label}
            </div>
            <div className="mt-4 font-mono text-[11px] tracking-[0.2em] text-white/50">
              {l.caption}
            </div>
          </div>
        </div>
      ))}
    </div>
  ),

  build: (tl, root) => {
    const layers = [...root.querySelectorAll<HTMLElement>('.curtain-layer')];
    if (layers.length === 0) return;

    layers.forEach((el, i) => {
      // 各層を順に拭き出す。開ききってから次が上に重なる。
      tl.to(
        el,
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 0.9,
          ease: CurtainLayer.heavyEase,
        },
        i * 0.75,
      );

      // 開いたあと、わずかに沈ませて奥行きを出す（最後の層は残す）
      if (i < layers.length - 1) {
        tl.to(
          el,
          {
            scale: 0.985,
            filter: 'brightness(0.72)',
            duration: 0.5,
            ease: 'none',
          },
          i * 0.75 + 0.9,
        );
      }
    });
  },
};
