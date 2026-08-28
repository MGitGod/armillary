"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { gsap, Draggable } from '../lib/gsap-config';
import {
  VIEW,
  CENTER,
  ticks,
  angleAt,
  timeAtAngle,
  type Body,
} from '../lib/orbital';
import { CurtainLayer } from '../lib/curtain-core';

type Props = {
  bodies: Body[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** 現在の系の時刻(秒)を毎フレーム外へ渡す。読み取り値の表示用。 */
  onTime?: (t: number) => void;
};

const TICKS = ticks(72, 6); // 5° 刻み、30° ごとに長い罫
const RIM = 336; // 目盛りの半径
const RIM_TEXT = 318; // 円周文字のベースライン半径

/**
 * 当たり判定の半径（viewBox 単位）。
 * 軌道間隔が 68 単位なので、64 までなら隣の軌道と重ならない。
 * デスクトップ表示(≈0.78 倍)で直径 50px 相当になる。
 */
const HIT = 32;

/** 追いつきにかける時間。止めるたびに遅れが積み上がるのを防ぐ。 */
const RESYNC = 1.1;

/**
 * 太陽系儀（Orrery）。
 *
 * 回転の駆動は「時刻 t」という 1 つのスカラーに集約している。
 * 自動回転・ドラッグはすべて t に加算するだけなので、
 * 入力同士が打ち消し合う調停ロジックが要らない。
 *
 * 天体を個別に止めるときだけ、その天体の時刻を t からずらす。
 *
 * 回転は GSAP の transform ではなく SVG の rotate(a, cx, cy) を直接書く。
 * GSAP の SVG transformOrigin は要素のバウンディングボックス基準に
 * 解決されるため、回転子(中身が軌道上に偏っている)では原点がずれる。
 */
export default function Orrery({ bodies, selected, onSelect, onTime }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<HTMLDivElement | null>(null);

  const [hovered, setHovered] = useState<string | null>(null);

  // 時刻の内訳。ref に持って毎フレーム読む（再レンダリングを起こさない）。
  const auto = useRef(0);
  const drag = useRef(0);

  // 天体ごとの時刻オフセット。系全体は同じ t で回るが、
  // 個別に t をずらすことでその天体だけ止められる。
  const offsets = useRef<Record<string, number>>({});
  // 停止中の天体 id -> 止めた瞬間の角度（正規化しない値）。
  // ホバー中と選択中が同時に止まりうるので単数ではなく集合で持つ。
  const held = useRef<Record<string, number>>({});

  // 依存配列に入れて effect を再実行させたくないので ref 経由で最新を読む。
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;

  const rimText = useMemo(() => {
    const label = bodies.map((b) => b.label.replace(/[[\]]/g, '')).join('  ·  ');
    return `${label}  ·  `.repeat(2);
  }, [bodies]);

  // 72 本の目盛りは不変。ホバーのたびに作り直さない。
  const tickMarks = useMemo(
    () =>
      TICKS.map((tk) => (
        <line
          key={tk.angle}
          x1={0}
          y1={-RIM}
          x2={0}
          y2={-RIM + (tk.major ? 16 : 7)}
          transform={`rotate(${tk.angle})`}
          stroke="currentColor"
          strokeWidth={tk.major ? 1.2 : 0.6}
          opacity={tk.major ? 0.5 : 0.22}
        />
      )),
    [],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const rotors = bodies.map((b) =>
      svg.querySelector<SVGGElement>(`[data-rotor="${b.id}"]`),
    );
    const labels = bodies.map((b) =>
      svg.querySelector<SVGGElement>(`[data-label="${b.id}"]`),
    );
    const hub = svg.querySelector<SVGGElement>('[data-hub]');

    const render = () => {
      const t = auto.current + drag.current;
      bodies.forEach((b, i) => {
        const frozen = held.current[b.id];
        // 止めている天体は凍結角度をそのまま描く。
        // ドラッグで t が動いても影響を受けない（止めたら止まったまま）。
        const a =
          frozen !== undefined
            ? frozen
            : angleAt(b, t - (offsets.current[b.id] ?? 0));
        rotors[i]?.setAttribute('transform', `rotate(${a} ${CENTER} ${CENTER})`);
        // 天体のラベルは自分の原点まわりに逆回転させて常に正立させる
        labels[i]?.setAttribute('transform', `rotate(${-a})`);
      });
      // ハブの微細な呼吸。curtain-core の pulse が本来書かれた用途。
      const breath = 1 + CurtainLayer.pulse(t);
      hub?.setAttribute(
        'transform',
        `translate(${CENTER},${CENTER}) scale(${breath.toFixed(5)})`,
      );

      onTimeRef.current?.(t);
    };

    const tick = (_t: number, delta: number) => {
      if (!reduced) auto.current += delta / 1000;
      render();
    };

    gsap.ticker.add(tick);
    render();

    // --- ドラッグで盤ごと回す ---
    // 回転量(deg)を、最外周の天体がその角度だけ進む時間に換算して t に加える。
    const outer = bodies[bodies.length - 1];
    const degToSec = outer ? Math.PI / 180 / outer.omega : 0;
    let draggable: Draggable[] = [];

    if (dragRef.current && outer) {
      draggable = Draggable.create(dragRef.current, {
        type: 'rotation',
        inertia: true,
        throwResistance: 1400,
        onDrag(this: Draggable) {
          drag.current = this.rotation * degToSec;
        },
        onThrowUpdate(this: Draggable) {
          drag.current = this.rotation * degToSec;
        },
      });
    }

    return () => {
      gsap.ticker.remove(tick);
      draggable.forEach((d) => d.kill());
    };
  }, [bodies]);

  // カーソルが乗った天体（と選択中の天体）を止める。
  //
  // 狙いは見た目ではなく操作性。動いている的はクリックできないので、
  // 触れた瞬間に止めて、落ち着いてクリックできるようにする。
  //
  // 解放時は「止めた角度になる時刻」を逆算してオフセットに積むので、
  // 本来居るべき位置へ飛ばず、止めた場所からそのまま回り出す。
  // ただしホバーは頻繁に起きるため、そのままだと遅れが際限なく積み上がる。
  // オフセットを 0 へ向けて戻し、少し速く回って系に追いつかせる。
  useEffect(() => {
    const now = () => auto.current + drag.current;
    const want = new Set([hovered, selected].filter(Boolean) as string[]);

    for (const id of Object.keys(held.current)) {
      if (want.has(id)) continue;
      const b = bodies.find((x) => x.id === id);
      if (b) {
        offsets.current[id] = now() - timeAtAngle(b, held.current[id]);
        gsap.killTweensOf(offsets.current, id);
        gsap.to(offsets.current, {
          [id]: 0,
          duration: RESYNC,
          ease: 'power2.inOut',
        });
      }
      delete held.current[id];
    }

    for (const id of want) {
      if (held.current[id] !== undefined) continue;
      const b = bodies.find((x) => x.id === id);
      if (!b) continue;
      // 追いつき中に掴まれたら、その時点の角度で止める
      gsap.killTweensOf(offsets.current, id);
      held.current[id] = angleAt(b, now() - (offsets.current[id] ?? 0));
    }
  }, [hovered, selected, bodies]);

  return (
    <div className="relative aspect-square w-full max-w-[min(92vw,78vh)]">
      {/*
        重なり順が肝。ドラッグ用ハンドルを下に敷き、SVG を上に重ねる。
        SVG ルートは pointer-events:none にしてあるので、塗られていない領域は
        そのままハンドルに抜ける。天体の当たり判定だけ pointer-events を戻す。
      */}
      <div
        ref={dragRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        aria-hidden
      />

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <defs>
          <path
            id="rim-path"
            d={`M ${CENTER} ${CENTER - RIM_TEXT} a ${RIM_TEXT} ${RIM_TEXT} 0 1 1 -0.01 0`}
            fill="none"
          />
        </defs>

        {/* 外周の角度目盛り */}
        <g transform={`translate(${CENTER},${CENTER})`}>{tickMarks}</g>

        {/* 軌道リング */}
        {bodies.map((b) => {
          const active = selected === b.id || hovered === b.id;
          return (
            <circle
              key={`ring-${b.id}`}
              data-ring={b.id}
              cx={CENTER}
              cy={CENTER}
              r={b.radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={active ? 1.1 : 0.5}
              opacity={active ? 0.7 : 0.16}
              className="transition-opacity duration-200"
            />
          );
        })}

        {/* 天体（回転子ごと回す） */}
        {bodies.map((b) => {
          const isHovered = hovered === b.id;
          const active = isHovered || selected === b.id;
          return (
            <g key={b.id} data-rotor={b.id}>
              <g transform={`translate(${CENTER + b.radius},${CENTER})`}>
                {/* 掴めることを示す外輪。ホバー時だけ出る。 */}
                <circle
                  r={HIT * 0.55}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={0.8}
                  opacity={isHovered ? 0.55 : 0}
                  className="transition-opacity duration-200"
                />
                <circle
                  r={isHovered ? b.size * 1.7 : b.size}
                  fill="currentColor"
                  opacity={active ? 1 : 0.75}
                  className="transition-all duration-200"
                />
                {/* 当たり判定を見た目より広く取る。ここだけ pointer-events を戻す。 */}
                <circle
                  r={HIT}
                  fill="transparent"
                  className="pointer-events-auto cursor-pointer"
                  onPointerEnter={() => setHovered(b.id)}
                  onPointerLeave={() =>
                    setHovered((h) => (h === b.id ? null : h))
                  }
                  onClick={() => onSelect(selected === b.id ? null : b.id)}
                />
                <g data-label={b.id}>
                  <text
                    y={-(isHovered ? b.size * 1.7 : b.size) - 13}
                    textAnchor="middle"
                    fontSize={10}
                    fill="currentColor"
                    letterSpacing={1.5}
                    opacity={active ? 0.95 : 0.38}
                    className="transition-opacity duration-200"
                    style={{ fontFamily: 'var(--font-martian), ui-monospace, monospace' }}
                  >
                    {b.label.replace(/[[\]]/g, '').slice(0, 20)}
                  </text>
                </g>
              </g>
            </g>
          );
        })}

        {/* ハブ */}
        <g data-hub transform={`translate(${CENTER},${CENTER})`}>
          <circle r={26} fill="none" stroke="currentColor" strokeWidth={0.6} opacity={0.35} />
          <circle r={4.5} fill="currentColor" />
          <line x1={-38} y1={0} x2={-30} y2={0} stroke="currentColor" opacity={0.4} />
          <line x1={30} y1={0} x2={38} y2={0} stroke="currentColor" opacity={0.4} />
          <line x1={0} y1={-38} x2={0} y2={-30} stroke="currentColor" opacity={0.4} />
          <line x1={0} y1={30} x2={0} y2={38} stroke="currentColor" opacity={0.4} />
        </g>

        {/* 円周文字。装飾として回り続けるので正立させない（設計どおり）。 */}
        <text
          fontSize={10}
          fill="currentColor"
          opacity={0.3}
          letterSpacing={4}
          style={{ fontFamily: 'var(--font-martian), ui-monospace, monospace' }}
        >
          <textPath href="#rim-path" startOffset="0%">
            {rimText}
          </textPath>
        </text>
      </svg>
    </div>
  );
}
