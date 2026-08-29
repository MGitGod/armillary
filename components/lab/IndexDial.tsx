"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollTrigger } from '../../lib/gsap-config';
import { arcPath } from '../../lib/curves';
import type { Experiment } from '../../lib/lab';

const R = 34; // セグメントの半径
const TICK = 42; // 境界の目盛り半径

type Range = { id: string; title: string; from: number; to: number; scrollTo: number };

/**
 * Index Dial — ラボ全体の現在地と、実験への飛び先を兼ねた計器。
 *
 * ページ全長を円周 360° に写し、各実験を「スクロール量に比例した弧」として並べる。
 * 弧の長さがそのまま実験の長さなので、目次と進捗計が 1 つになる。
 *
 * 実測はスクロール位置ではなく DOM から取る。ピン留めされた実験は
 * pin-spacer が実際に占有する範囲なので、そちらを測る。
 * 実験を足しても registry を見て自動で分割されるため、ここは触らなくてよい。
 */
export default function IndexDial({ experiments }: { experiments: Experiment[] }) {
  const [ranges, setRanges] = useState<Range[]>([]);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  const needleRef = useRef<SVGGElement | null>(null);
  const pctRef = useRef<SVGTextElement | null>(null);
  const activeRef = useRef(0);
  // scroll ハンドラは ref から読む。state を effect の依存に入れると
  // measure→setRanges→effect 再実行→measure … で回り続けてしまう。
  const rangesRef = useRef<Range[]>([]);

  const measure = useCallback(() => {
    const total = document.documentElement.scrollHeight - window.innerHeight;
    if (total <= 0) return;

    const next: Range[] = [];
    for (const exp of experiments) {
      const section = document.getElementById(exp.id);
      if (!section) continue;

      // ピン留めされていれば、実際に占有しているのは pin-spacer のほう
      const parent = section.parentElement;
      const box =
        parent && parent.classList.contains('pin-spacer') ? parent : section;

      const rect = box.getBoundingClientRect();
      const top = rect.top + window.scrollY;

      next.push({
        id: exp.id,
        title: exp.title,
        from: Math.max(0, (top / total) * 360),
        to: Math.min(360, ((top + rect.height) / total) * 360),
        scrollTo: top,
      });
    }
    rangesRef.current = next;
    setRanges(next);
  }, [experiments]);

  useEffect(() => {
    measure();

    // スクロールは rAF に依存せず発火するので、針は直接 DOM に書く。
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;

      needleRef.current?.setAttribute('transform', `rotate(${p * 360})`);
      if (pctRef.current) {
        pctRef.current.textContent = `${Math.round(p * 100)}`.padStart(2, '0');
      }

      // 現在の実験。state 更新は区間をまたいだときだけに絞る。
      const deg = p * 360;
      const rs = rangesRef.current;
      let idx = 0;
      for (let i = 0; i < rs.length; i++) {
        if (deg >= rs[i].from) idx = i;
      }
      if (idx !== activeRef.current) {
        activeRef.current = idx;
        setActive(idx);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    ScrollTrigger.addEventListener('refresh', measure);
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      ScrollTrigger.removeEventListener('refresh', measure);
    };
  }, [measure]);

  const jump = (r: Range) =>
    window.scrollTo({ top: r.scrollTo + 2, behavior: 'smooth' });

  const shown = hovered !== null ? hovered : active;

  return (
    <div className="fixed bottom-5 right-5 z-50 select-none">
      {/* 現在（またはホバー中）の実験名。ダイヤルの左に出す。 */}
      <div className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 whitespace-nowrap text-right font-mono text-[10px] leading-relaxed sm:block">
        <div className="tracking-[0.3em] text-white/25">
          {String(shown + 1).padStart(2, '0')}
        </div>
        <div className="tracking-wider text-white/70">
          {ranges[shown]?.title ?? ''}
        </div>
      </div>

      <svg
        viewBox="-50 -50 100 100"
        className="h-[68px] w-[68px] overflow-visible sm:h-[92px] sm:w-[92px]"
      >
        <g style={{ color: 'white' }}>
          {/* 外周と、実験の境界を示す目盛り */}
          <circle r={R} fill="none" stroke="currentColor" strokeWidth={0.5} opacity={0.15} />
          {ranges.map((r) => (
            <line
              key={`tick-${r.id}`}
              x1={0}
              y1={-TICK}
              x2={0}
              y2={-TICK + 5}
              transform={`rotate(${r.from})`}
              stroke="currentColor"
              strokeWidth={0.7}
              opacity={0.35}
            />
          ))}

          {/*
            実験ごとの弧。長さがそのまま実験の長さ。

            当たり判定は見た目とは別に持つ。実測（15 実験・92px 表示）で、
            最も短い弧は **3.8px × 1.84px ≈ 7px²** しかなかった。
            WCAG 2.5.8 が求める 24×24px には遠く、しかも弧長で 24px を得るには
            R=34 で 43.9° 必要 ── 15 実験なら 659° になり、この大きさでは幾何的に不可能。

            そこで透明な太い線を重ねて、少なくとも半径方向は指で追えるようにする。
            同じ 92px 表示で 3.8px × 1.84px ≈ 7px² が 3.8px × 14.7px ≈ 56px² になる（約 8 倍）。
            それでも 576px² には遠い。弧長そのものは伸ばせないので、
            これは緩和であって解決ではない。キーボードと支援技術には
            下の sr-only の nav が実体のボタンを出しているので、そちらが正規の経路。
          */}
          {ranges.map((r, i) => {
            const on = i === active;
            const hot = i === hovered;
            // 隣と 2° 空けて、境目が読めるようにする
            const d = arcPath(R, r.from + 1, Math.max(r.from + 1.5, r.to - 1));
            const handlers = {
              onPointerEnter: () => setHovered(i),
              onPointerLeave: () => setHovered((h: number | null) => (h === i ? null : h)),
              onClick: () => jump(r),
            };
            return (
              <g key={r.id}>
                {/* 当たり判定。塗らないので見えないが、stroke の幅ぶん掴める */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  strokeLinecap="butt"
                  className="pointer-events-auto cursor-pointer"
                  {...handlers}
                />
                <path
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={on || hot ? 3.5 : 2}
                  strokeLinecap="butt"
                  opacity={on ? 0.95 : hot ? 0.7 : 0.3}
                  className="pointer-events-none transition-all duration-200"
                />
              </g>
            );
          })}

          {/* 針 */}
          <g ref={needleRef}>
            <line x1={0} y1={0} x2={0} y2={-(R - 5)} stroke="currentColor" strokeWidth={1} />
            <circle cx={0} cy={-(R - 5)} r={2} fill="currentColor" />
          </g>
          <circle r={2} fill="currentColor" opacity={0.6} />

          {/* 中心の読み取り値（％） */}
          <text
            ref={pctRef}
            x={0}
            y={16}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            opacity={0.5}
            style={{ fontFamily: 'var(--font-martian), ui-monospace, monospace' }}
          >
            00
          </text>
        </g>
      </svg>

      {/* キーボードとスクリーンリーダー向けの実体。ダイヤルはポインタ専用。 */}
      <nav aria-label="Experiments" className="sr-only">
        <ul>
          {ranges.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => jump(r)}>
                {r.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
