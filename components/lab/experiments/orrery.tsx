"use client";
import React, { useCallback, useMemo, useRef, useState } from 'react';
import Orrery from '../../Orrery';
import KineticTitle from '../../KineticTitle';
import { site, labGroups } from '../../../lib/content';
import { layoutBodies } from '../../../lib/orbital';
import type { Experiment } from '../../../lib/lab';
import { Corner } from '../Corner';

/**
 * 対話型なので scrub しない（pin: false）。
 * スクロールで送るのではなく、手で回して選ぶ実験。
 * 天体はラボの棚をテーマで束ねたもの。選ぶとそのテーマの中身が読める。
 */
function OrreryStage() {
  const bodies = useMemo(
    () => layoutBodies(labGroups.map((g) => ({ id: g.id, label: g.title }))),
    [],
  );

  const [selected, setSelected] = useState<string | null>(null);
  const group = labGroups.find((g) => g.id === selected) ?? null;
  const body = bodies.find((b) => b.id === selected) ?? null;

  const title = group
    ? group.title
    : `${site.headline.lead} ${site.headline.accent}`;

  // 毎フレーム state を更新すると再レンダリングが 60fps で走るので、
  // 読み取り値だけ DOM に直接書く。
  const clockRef = useRef<HTMLSpanElement | null>(null);
  const handleTime = useCallback((t: number) => {
    if (clockRef.current) {
      clockRef.current.textContent = `T+${t.toFixed(2).padStart(9, '0')}`;
    }
  }, []);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <Orrery
        bodies={bodies}
        selected={selected}
        onSelect={setSelected}
        onTime={handleTime}
      />

      {/* 見出しは計器の上に重ねる。difference で罫線と交差した部分が反転する。 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
        <KineticTitle
          text={title}
          className="text-center text-[clamp(2rem,7vw,5.5rem)] font-bold leading-[0.95] tracking-tighter mix-blend-difference"
        />
      </div>

      <Corner className="right-5 top-5 text-right" label="ELAPSED">
        <span ref={clockRef}>T+000000.00</span>
      </Corner>

      <Corner className="bottom-5 left-5" label="SELECTED">
        {body && group ? (
          <>
            {group.title}
            <br />
            R {body.radius.toFixed(0)} · P {(6.2832 / body.omega).toFixed(1)}s
            <br />
            <span className="text-white/40">{group.summary}</span>
          </>
        ) : (
          <span className="text-white/30">NO BODY SELECTED</span>
        )}
      </Corner>

      {/* 右下は Index Dial が居るので下中央へ逃がす */}
      <Corner
        className="bottom-24 left-1/2 max-w-none -translate-x-1/2 text-center sm:bottom-5"
        label="INPUT"
      >
        HOVER TO HOLD
        <br />
        CLICK TO OPEN
        <br />
        DRAG TO ROTATE
      </Corner>
    </div>
  );
}

export const orrery: Experiment = {
  id: 'orrery',
  title: 'Orrery',
  tech: ['三角関数', '円運動', 'Draggable', 'Inertia'],
  note: 'ケプラーの第三法則で角速度を決めると、動きに理屈が入る。',
  pin: false,
  Component: OrreryStage,
};
