"use client";
import React, { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '../../lib/gsap-config';
import type { Experiment } from '../../lib/lab';
import Ornament, { ornamentMark } from '../Ornament';

/**
 * 実験 1 個ぶんの外殻。
 *
 * ピン留めして、スクロール量をそのままタイムラインの再生位置に変換する。
 * 実験側は build() でタイムラインを組むだけでよく、
 * ピンの張り方も端の遷移もここが一括で面倒を見る。
 * これにより、実験を足すときにスクロールの配線を書かなくて済む。
 */
export default function LabSection({
  exp,
  index,
}: {
  exp: Experiment;
  index: number;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage || !exp.build) return;
    if (exp.pin === false) return;

    // 動きを減らす設定では、ピンも scrub も張らずに静止画として見せる。
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let disposeBuild: (() => void) | void;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true });
      disposeBuild = exp.build?.(tl, stage);

      const D = tl.duration() || 1;
      if (exp.fade !== false) {
        // 端の出入りを共通で与える。実験ごとに書かなくても遷移が揃う。
        tl.from(stage, { opacity: 0, duration: D * 0.1, ease: 'none' }, 0);
        tl.to(stage, { opacity: 0, duration: D * 0.1, ease: 'none' }, D * 0.9);
      }

      ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: () => `+=${(exp.length ?? 1.5) * window.innerHeight}`,
        pin: true,
        pinSpacing: true,
        scrub: 0.6,
        animation: tl,
        invalidateOnRefresh: true,
      });
    }, section);

    return () => {
      ctx.revert();
      if (typeof disposeBuild === 'function') disposeBuild();
    };
  }, [exp]);

  const Interactive = exp.Component;

  return (
    <section
      ref={sectionRef}
      id={exp.id}
      className="relative flex h-svh items-center justify-center overflow-hidden px-4"
    >
      <div ref={stageRef} className="flex h-full w-full items-center justify-center">
        {Interactive ? <Interactive /> : exp.render?.()}
      </div>

      {/* 実験の見出し。全実験で同じ位置・同じ組み方にして、ラボの棚札にする。
          小画面では図に被るので、注記を畳んで幅を詰める。 */}
      <div className="pointer-events-none absolute left-5 top-5 max-w-[9rem] font-mono text-[10px] leading-relaxed sm:max-w-[16rem]">
        {/* 標本の識別マーク。セクションごとに形が違い、回転だけが全体で揃う。
            セクションは 1 画面ずつなので、同時に見えるのは常に 1 つ。 */}
        <div className="mb-2 flex items-center gap-2">
          <Ornament {...ornamentMark(index)} size={40} className="text-white/70" />
          <span className="tracking-[0.3em] text-white/25">
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>
        <div className="mb-2 text-xs tracking-wide text-white/80 sm:text-sm">
          {exp.title}
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {exp.tech.map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/15 px-2 py-0.5 tracking-wider text-white/40"
            >
              {t}
            </span>
          ))}
        </div>
        <p className="hidden text-white/35 sm:block">{exp.note}</p>
      </div>
    </section>
  );
}
