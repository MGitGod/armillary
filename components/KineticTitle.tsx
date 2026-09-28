"use client";
import React, { useEffect, useRef } from 'react';
import { gsap, SplitText } from '../lib/gsap-config';

type Props = {
  text: string;
  className?: string;
};

/**
 * 見出しの入退場。
 *
 * 入り: SplitText で 1 文字に分解し、外周の各方位から MotionPath の弧を描いて
 *       中心の定位置へ飛来する。直線フェードにしないのがこの計器の作法。
 * 退き: 直前の文字を「残像レイヤー」へ複製し、Physics2DPlugin で散らす。
 *
 * 重要な設計上の判断:
 * 新しいテキストの反映を、散らしアニメの onComplete に依存させない。
 * 依存させると tween が完走しない状況（バックグラウンドタブで rAF が停止する、
 * 途中で別の選択が入る）で、表示が選択状態と永久にずれる。
 * 本文は常に即座に差し替え、散らしは切り離した残像として後追いさせる。
 * これで「見えている文字列は必ず現在の選択」が保証される。
 *
 * 中身は React ではなく GSAP/DOM 側で制御する。
 * SplitText は要素の子を作り替えるので、React に管理させると衝突する。
 */
export default function KineticTitle({ text, className }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const splitRef = useRef<SplitText | null>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const ghost = ghostRef.current;
    if (!host || !ghost) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    tlRef.current?.kill();
    tlRef.current = null;

    // --- 退き: 直前の文字を残像へ移してから散らす ---
    const prev = splitRef.current;
    if (prev && !reduced && prev.chars.length > 0) {
      const hostBox = host.getBoundingClientRect();
      gsap.killTweensOf(ghost.children);
      ghost.replaceChildren();

      (prev.chars as HTMLElement[]).forEach((ch) => {
        const box = ch.getBoundingClientRect();
        const clone = ch.cloneNode(true) as HTMLElement;
        clone.style.position = 'absolute';
        clone.style.left = `${box.left - hostBox.left}px`;
        clone.style.top = `${box.top - hostBox.top}px`;
        clone.style.margin = '0';
        ghost.appendChild(clone);
      });

      gsap.to(ghost.children, {
        duration: 0.85,
        physics2D: {
          velocity: 'random(180, 460)',
          angle: 'random(250, 290)',
          gravity: 1500,
        },
        opacity: 0,
        stagger: 0.012,
        onComplete: () => ghost.replaceChildren(),
      });
    }

    try {
      prev?.revert();
    } catch {
      // DOM が既に差し替わっていれば捨てて良い
    }

    // --- 入り: 本文は無条件に即差し替える ---
    host.textContent = text;
    // chars だけで割ると文字が単語にまとまらず、狭い画面で単語の途中で改行される
    // （390px で "Uncomm / on." になった）。words も割ると単語が inline-block の箱になり、
    // 折り返しは単語の境目でしか起きない。動かすのは chars のままなので演出は変わらない。
    const split = new SplitText(host, { type: 'words,chars' });
    splitRef.current = split;

    const chars = split.chars as HTMLElement[];
    if (reduced || chars.length === 0) return;

    const tl = gsap.timeline();
    tlRef.current = tl;

    const n = chars.length;
    const R = 430;

    chars.forEach((ch, i) => {
      // 文字ごとに違う方位から入る。真上を 0 として一周に散らす。
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const fromX = Math.cos(a) * R;
      const fromY = Math.sin(a) * R;

      tl.set(ch, { x: fromX, y: fromY, rotate: -50, opacity: 0 }, 0).to(
        ch,
        {
          motionPath: {
            // 中間点を内側にずらすことで直線ではなく弧になる
            path: [
              { x: fromX * 0.42, y: fromY * 0.42 - 60 },
              { x: 0, y: 0 },
            ],
            curviness: 1.6,
          },
          rotate: 0,
          opacity: 1,
          duration: 1.35,
          ease: 'instrument',
        },
        i * 0.028,
      );
    });

    return () => {
      tlRef.current?.kill();
    };
  }, [text]);

  return (
    <div className={`relative ${className ?? ''}`}>
      <div ref={hostRef} />
      <div ref={ghostRef} className="pointer-events-none absolute inset-0" aria-hidden />
    </div>
  );
}
