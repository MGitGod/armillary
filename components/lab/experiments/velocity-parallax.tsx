"use client";
import React, { useEffect, useRef } from 'react';
import { ScrollTrigger } from '../../../lib/gsap-config';
import type { Experiment } from '../../../lib/lab';
import {
  approach,
  rateFromPerFrame,
  stepSpring,
  velocitySkew,
  type Spring,
} from '../../../lib/parallax';
import { setText, visibleLoop } from '../raf-loop';

const WORDS = [
  { text: 'SURFACE', z: 0.00, size: 62, top: 40 },
  { text: 'MIDDLE',  z: 0.34, size: 50, top: 132 },
  { text: 'DEEP',    z: 0.67, size: 40, top: 216 },
  { text: 'FLOOR',   z: 1.00, size: 30, top: 288 },
];
/**
 * 層が動く総量 [px]。ステージ高 380px の 55% ほど。
 * これより大きいと最前面の語が枠外へ抜け、小さいと 4 層の差が読めない。
 */
const TRAVEL = 210;

/**
 * 速度の減衰と skew の平滑化。もとは per-frame の 0.86 と 0.16 だったが、
 * それだと 120Hz で倍の速さに、30fps で半分の速さになる。
 * 60fps 換算で同じ見た目になる rate に直してある（lib/parallax.ts の approach を参照）。
 */
const DECAY_RATE = rateFromPerFrame(1 - 0.86);  // ≈ 9.05 /s
const SKEW_RATE = rateFromPerFrame(0.16);       // ≈ 10.46 /s

/**
 * 速度視差。
 *
 * 深度を位置のずれではなく**追従の遅れ**で表現する。
 * 層ごとに剛性の違うばねを持たせ、奥ほど柔らかくする（臨界減衰）。
 * スクロールを止めても、奥の層はまだ沈み続けている。
 *
 * スクロール速度そのものを可視化しているので、**止まっている状態では視差が完全に消える**。
 * これは欠点ではなく利点で、読んでいる最中は画面が静止する。
 *
 * 画像素材が一切なくてもタイポグラフィだけで成立するので、
 * 写真を持たない編集系・テキスト主体のサイトで唯一使えるパララックスでもある。
 *
 * skew のクランプを固定値にすると、常用域（実測 2,000〜8,600 px/s）で
 * 全層が上限に張り付いて深度差がちょうど消える。上限自体を深度依存にしてある
 * （lib/parallax.ts の velocitySkew を参照）。
 */
function VelocityParallax() {
  const stage = useRef<HTMLDivElement | null>(null);
  const read = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;

    // pin:false なので自前で見る。これは操作ではなく副作用なので、
    // 動きを減らす設定では速度エフェクトごと殺す（#13 と扱いが違う）。
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const nodes = Array.from(el.querySelectorAll<HTMLElement>('.vp-word'));
    const springs: Spring[] = nodes.map(() => ({ y: 0, v: 0 }));
    const skews = nodes.map(() => 0);
    let velocity = 0;
    let progress = 0;

    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        progress = self.progress;
        velocity = self.getVelocity();
      },
    });

    const stopLoop = visibleLoop(el, (dt) => {
      // スクロールが止まると ScrollTrigger は onUpdate を呼ばなくなるので、
      // 速度は自前で減衰させる。放置すると最後の値が残り続ける。
      velocity = approach(velocity, 0, DECAY_RATE, dt);

      let maxLag = 0;
      nodes.forEach((node, i) => {
        const z = WORDS[i].z;
        const target = -progress * TRAVEL * (1 - 0.55 * z);
        springs[i] = stepSpring(springs[i], target, z, dt);
        skews[i] = approach(skews[i], velocitySkew(velocity, z), SKEW_RATE, dt);
        node.style.transform =
          `translate3d(0,${springs[i].y.toFixed(2)}px,0) skewY(${skews[i].toFixed(2)}deg)`;
        maxLag = Math.max(maxLag, Math.abs(target - springs[i].y));
      });
      setText(read.current,
        `velocity ${velocity.toFixed(0)} px/s · 最大遅れ ${maxLag.toFixed(1)} px`);
    });

    return () => {
      stopLoop();
      st.kill();
    };
  }, []);

  return (
    <div className="w-full max-w-4xl">
      <div
        ref={stage}
        className="relative overflow-hidden border border-white/15"
        style={{ height: 380 }}
      >
        {WORDS.map((w) => (
          <div
            key={w.text}
            className="vp-word absolute left-0 w-full whitespace-nowrap text-center leading-none"
            style={{
              top: w.top,
              fontSize: w.size,
              willChange: 'transform',
              color: w.z === 0 ? 'rgb(224 82 58)' : `color-mix(in srgb, #dce8f2 ${(100 - w.z * 55).toFixed(0)}%, #12212e)`,
            }}
          >
            {w.text}
          </div>
        ))}
        {/* 深度の目盛り。層が動いても、これは動かない。 */}
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 9 }}>
          {WORDS.map((w) => (
            <React.Fragment key={w.text}>
              <div className="absolute inset-x-0 h-px bg-white/10" style={{ top: w.top + w.size * 0.62 }} />
              <div className="absolute left-2.5 font-mono text-[9px] tracking-[0.14em] text-white/25"
                   style={{ top: w.top + w.size * 0.62 + 3 }}>
                z {w.z.toFixed(2)}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-[11px] text-white/40">
        {/*
          初期テキストを持たせる。動きを減らす設定では effect ごと早期 return するので、
          ここで与えないと読み値が恒久的に空欄になる。
          静止時（速度 0・遅れ 0）の値そのものなので、意味も合う。
        */}
        <span ref={read}>velocity 0 px/s · 最大遅れ 0.0 px</span>
        <span className="text-white/25">勢いよくスクロールして、止めてみる</span>
      </div>
    </div>
  );
}

export const velocityParallax: Experiment = {
  id: 'velocity-parallax',
  title: 'Velocity Parallax',
  tech: ['臨界減衰ばね', 'getVelocity()'],
  note: '位置ではなく遅れで深度を出す。止まると視差が完全に消えるので、読んでいる間は静止する。',
  pin: false,
  Component: VelocityParallax,
};
