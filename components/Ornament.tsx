"use client";
import React, { useEffect, useRef } from 'react';
import { rosePath, lissajousPath } from '../lib/curves';
import { CurtainLayer } from '../lib/curtain-core';
import { subscribe, prefersReducedMotion } from '../lib/ornament-clock';

const R = 100;

/**
 * 分割数は表示サイズに応じて決める。
 * 40px の飾りに 420 点は無駄で、毎フレーム全点ぶんのパス文字列を作り直すことになる。
 */
const samplesFor = (size: number) => Math.max(180, Math.min(420, Math.round(size * 6)));
/** 平常時の回転（度/秒）。Orrery の最外周と同程度＝読んでいる間は動いて見えない。 */
const REST_SPIN = 2.6;
/** スクロールで図形がどれだけ崩れるか。 */
const SWING = 1.25;

type Kind = 'rose' | 'lissajous';

/**
 * 連番から重複しない識別マークを導く。
 *
 * kind を index%2、param を index%4 で決めると 2 つの周期が同期して
 * 4 種類しか出ない（01 と 05 が同じ形になる）。
 * param は「ペア単位」で進めることで、種類×パラメータが 8 通りに開く。
 *
 * 値は全て整数。静止時に図形が閉じることが「落ち着いた」合図になるため。
 * リサージュは a=3 固定なので b=3 は 1:1 の楕円に潰れる。その値は避ける。
 */
/**
 * 小さく描くので、花弁や交点が詰まりすぎない値だけを使う。
 * k=7 のバラは 14 枚の花弁になり 40px では潰れて識別できない。
 */
const ROSE_K = [3, 2, 5, 4];
const LISS_B = [2, 4, 5, 6];

export const ornamentMark = (index: number): { kind: Kind; param: number } => {
  const kind: Kind = index % 2 === 0 ? 'rose' : 'lissajous';
  const step = Math.floor(index / 2) % 4;
  return { kind, param: kind === 'rose' ? ROSE_K[step] : LISS_B[step] };
};

type Props = {
  kind?: Kind;
  /** 表示サイズ(px)。 */
  size?: number;
  /**
   * 静止時のパラメータ。整数にすると図形が閉じるので、
   * 「スクロールを止めた瞬間に形が決まる」合図になる。
   */
  param?: number;
  className?: string;
  title?: string;
};

/**
 * turns は 1。バラ曲線 r=cos(kθ) は k が奇数なら θ∈[0,π] で閉じるので、
 * 2 回転させると同じ線を 4 重に描くことになる（見た目は同じで長さだけ 4 倍）。
 * 小さく描く飾りでは、その重なりが線間を潰して図形が読めなくなる。
 */
const draw = (kind: Kind, param: number, samples: number) =>
  kind === 'rose'
    ? rosePath(param, R, samples, 1)
    : lissajousPath(3, param, Math.PI / 6, R, samples);

/**
 * 小さな飾り。ただし飾りではなく「静かな計器」。
 *
 * - 平常時: 知覚できない速さでドリフトする（形はほぼ閉じたまま）
 * - スクロール中: 共有時計のエネルギーで形が崩れ、回転が速まる
 * - 止めると: 慣性で減衰し、図形が閉じて静止する＝落ち着いた合図
 *
 * スクロールは一切奪わない。ピンもしない。
 * 画面外では時計ごと止まる。prefers-reduced-motion では静止画。
 */
export default function Ornament({
  kind = 'rose',
  size = 96,
  param = 3,
  className,
  title,
}: Props) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const group = groupRef.current;
    const path = pathRef.current;
    if (!host || !group || !path) return;
    // 動きを減らす設定では、SSR が出した静止形のまま何もしない。
    if (prefersReducedMotion()) return;

    const handle = subscribe((t, energy) => {
      // drift は curtain-core の「微細な揺らぎ」。±0.05 程度。
      // これだけだと図形はほぼ閉じたまま＝知覚できないドリフト。
      const p = param + CurtainLayer.drift(t) + energy * SWING;
      path.setAttribute('d', draw(kind, p, samplesFor(size)));
      group.setAttribute('transform', `rotate(${(t * REST_SPIN).toFixed(2)})`);
    });

    // 画面外では時計ごと止める。飾りが増えたときに効く。
    const io = new IntersectionObserver(
      ([entry]) => handle.setVisible(entry.isIntersecting),
      { rootMargin: '15%' },
    );
    io.observe(host);

    return () => {
      io.disconnect();
      handle.stop();
    };
  }, [kind, param, size]);

  return (
    <span
      ref={hostRef}
      className={className}
      style={{ display: 'inline-block', width: size, height: size }}
      aria-hidden
      title={title}
    >
      <svg viewBox="-120 -120 240 240" className="h-full w-full">
        <g ref={groupRef}>
          <path
            ref={pathRef}
            d={draw(kind, param, samplesFor(size))}
            fill="none"
            stroke="currentColor"
            // viewBox 単位のままだと縮小率ぶん線が細る（240 を 40px で描くと 1/6）。
            // non-scaling-stroke で最終的な描画座標系の px として解決させる。
            vectorEffect="non-scaling-stroke"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </span>
  );
}
