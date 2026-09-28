"use client";
import React, { useEffect } from 'react';
import LabSection from '../components/lab/LabSection';
import { experiments } from '../components/lab/registry';
import IndexDial from '../components/lab/IndexDial';
import { site } from '../lib/content';
import { ScrollTrigger } from '../lib/gsap-config';
import Ornament from '../components/Ornament';

export default function LabPage() {
  // Web フォントの読み込みでレイアウトが動くと、それ以前に計算された
  // ピンの開始位置と区間長がずれる。読み込みが終わってから測り直す。
  // next/font は swap なので、初回描画とフォント適用のあいだに必ず差が出る。
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) ScrollTrigger.refresh();
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main>
      <IndexDial experiments={experiments} />

      {experiments.map((exp, i) => (
        <LabSection key={exp.id} exp={exp} index={i} />
      ))}

      {/* ===== 終端 ===== */}
      <section className="mx-auto max-w-3xl px-6 pb-32 pt-24">
        <div className="border-t border-white/15 pt-8">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="font-mono text-[10px] tracking-[0.3em] text-white/25">
              TERMINUS · {String(experiments.length).padStart(2, '0')} EXPERIMENTS
            </div>
            {/* 飾りだが計器。共有時計を読むので 2 つは位相が揃って回る。
                スクロールで形が崩れ、止めると閉じて静まる。 */}
            <div className="flex items-center gap-2 text-white/70">
              <Ornament kind="lissajous" param={2} size={48} title="Lissajous 3:2" />
              <Ornament kind="rose" param={3} size={60} title="Rhodonea k=3" />
            </div>
          </div>

          <h2 className="text-[clamp(1.75rem,5vw,3.5rem)] font-bold leading-none tracking-tighter">
            Let&rsquo;s make something{' '}
            <span className="font-serif italic">worth remembering</span>.
          </h2>

          <div className="mt-8">
            {/* 連絡先の代わりにソースを置く。公開ページに個人情報を載せずに済み、
                見た人がそのまま実装を読みに行ける。 */}
            <a
              href={site.source}
              className="inline-flex h-11 items-center border-b border-white/30 text-xl transition-colors hover:border-white"
            >
              {site.source.replace(/^https:\/\//, '')}
            </a>
            <p className="mt-4 font-mono text-[10px] tracking-[0.25em] text-white/30">
              SOURCE · NEXT.JS + GSAP
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
