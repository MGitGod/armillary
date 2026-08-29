import React from 'react';
import type { Experiment } from '../../../lib/lab';
import {
  RIDGE_LAYERS,
  depthCues,
  maxTravel,
  ridgeBox,
  ridgePath,
} from '../../../lib/parallax';

const STAGE_H = 420;
const CUES = [
  { key: 'speed', label: '速度差' },
  { key: 'blur', label: 'ぼけ' },
  { key: 'tone', label: '彩度・コントラスト' },
  { key: 'occ', label: '遮蔽' },
] as const;
type CueKey = (typeof CUES)[number]['key'];

/**
 * 深度層。
 *
 * 手がかりを 1 つずつ外せるようにしてあるのが、この実験の全て。
 *
 *   速度差だけ残す → 層が動いているだけで奥に見えない（世の中のパララックスの大半）
 *   遮蔽を切る    → 最も派手に崩れる。手前が奥を隠すことが単眼で最強の手がかり
 *
 * 運動視差は単独では弱い単眼手がかりで、他と足し算して初めて効く。
 * 両眼視差と併用すると 3D 構造の検出閾値が平均 48% 下がるという測定がある
 * （Royal Society, 2016）。それを体で確かめられるようにした。
 *
 * 速度・ぼけ・彩度・スケールは全部 depthCues(z) から導く。
 * 別々に手で調整すると必ずずれる。
 */
export const depthStack: Experiment = {
  id: 'depth-stack',
  title: 'Depth Stack',
  tech: ['大気遠近', '遮蔽', 'depthCues(z)'],
  note: '手がかりを一つずつ外せる。速度差だけ残すと、動いているのに奥に見えなくなる。',
  length: 2.2,

  render: () => (
    <div className="relative w-full max-w-4xl">
      <div
        className="ds-stage relative overflow-hidden border border-white/15"
        style={{ height: STAGE_H, background: 'linear-gradient(#12212e, #05090d)' }}
      >
        {RIDGE_LAYERS.map((L, i) => {
          const box = ridgeBox(L.height);
          return (
            <svg
              key={i}
              className="ds-ridge absolute block"
              data-z={L.z}
              viewBox={box.viewBox}
              preserveAspectRatio="none"
              style={{
                left: '-8%',
                width: '116%',
                height: box.height,
                bottom: box.bottom,
                zIndex: RIDGE_LAYERS.length - i,
                willChange: 'transform',
                transformOrigin: '50% 20%',
                // 奥ほど地の色に寄る。大気遠近の主成分。
                color: `color-mix(in srgb, #dce8f2 ${(88 - L.z * 66).toFixed(0)}%, #12212e)`,
                // 動きを減らす設定では build() が呼ばれず applyCues() も走らないので、
                // 初期値をここで与えておく。与えないと静止画から大気遠近が丸ごと抜ける。
                filter: `blur(${depthCues(L.z).blur.toFixed(2)}px) saturate(${depthCues(L.z).saturate.toFixed(2)}) contrast(${depthCues(L.z).contrast.toFixed(2)})`,
                // 行程 0 では移動量が 0 なので、transform は scale だけでよい。
                transform: `scale(${depthCues(L.z).scale})`,
              }}
            >
              <path d={ridgePath(L.phase, L.amp, L.base)} fill="currentColor" />
            </svg>
          );
        })}

        {/* 前景の計器枠。遮蔽の最前面。 */}
        <svg viewBox="0 0 600 300" preserveAspectRatio="none"
             className="pointer-events-none absolute inset-0" style={{ zIndex: 20 }}>
          <rect x={16} y={16} width={568} height={268} fill="none"
                stroke="currentColor" strokeWidth={1} className="text-white/20" />
          {[[300, 16, 300, 40], [300, 260, 300, 284], [16, 150, 40, 150], [560, 150, 584, 150]].map((l, i) => (
            <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]}
                  stroke="currentColor" strokeWidth={1} style={{ color: 'rgb(224 82 58)' }} />
          ))}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/25">手がかり</span>
        {CUES.map((c) => (
          <button
            key={c.key}
            type="button"
            data-cue={c.key}
            disabled
            title="動きを減らす設定のため停止中"
            className="ds-cue rounded-sm border border-white/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-white/50 transition-colors hover:border-white/40 hover:text-white/80 aria-pressed:border-transparent aria-pressed:bg-white/85 aria-pressed:text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {c.label}
          </button>
        ))}
        {/* 初期テキストを持たせる。build() を通らない静止画でも読み値が空にならない。 */}
        <span className="ds-read ml-auto font-mono text-[11px] text-white/40">
          progress 0% · 手がかり 4/4 · 層 {RIDGE_LAYERS.length}
        </span>
      </div>
    </div>
  ),

  build: (tl, root) => {
    const ridges = Array.from(root.querySelectorAll<SVGElement>('.ds-ridge'));
    const read = root.querySelector<HTMLElement>('.ds-read');
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.ds-cue'));
    if (ridges.length === 0) return;

    const on: Record<CueKey, boolean> = { speed: true, blur: true, tone: true, occ: true };
    const state = { p: 0 };

    // 移動量は「手前の稜線が奥を追い越さない」上限から取る。
    // ステージ寸法が変わると変わる値なので、数値を手で置かない。
    const near = RIDGE_LAYERS[0];
    const far = RIDGE_LAYERS[RIDGE_LAYERS.length - 1];
    const range = maxTravel(
      near.height, far.height,
      depthCues(near.z).speed, depthCues(far.z).speed,
    );

    /**
     * ぼけ・彩度・不透明度・合成モードは、トグルを押したときしか変わらない。
     * 毎フレーム書くとスクロールのたびに合成が走るので、ここに分けてある
     * （毎フレーム触ってよいのは transform と opacity だけ、という制約に従う）。
     */
    const applyCues = () => {
      for (const el of ridges) {
        const z = Number(el.dataset.z);
        const c = depthCues(z);
        const blur = on.blur ? c.blur : 0;
        const sat = on.tone ? c.saturate : 1;
        const con = on.tone ? c.contrast : 1;
        el.style.filter = `blur(${blur.toFixed(2)}px) saturate(${sat.toFixed(2)}) contrast(${con.toFixed(2)})`;
        // 遮蔽を切ると層が透ける。単眼で最強の手がかりが抜けたときの崩れ方を見せる。
        el.style.opacity = on.occ ? '1' : z === 0 ? '0.55' : '0.45';
        el.style.mixBlendMode = on.occ ? 'normal' : 'screen';
      }
    };

    /** 毎フレーム。transform だけを書く。 */
    const draw = () => {
      for (const el of ridges) {
        const z = Number(el.dataset.z);
        const c = depthCues(z);
        const speed = on.speed ? c.speed : 1;
        el.style.transform =
          `translate3d(0,${(-state.p * range * speed).toFixed(2)}px,0) scale(${c.scale})`;
      }
      if (read) {
        const n = CUES.filter((c) => on[c.key]).length;
        read.textContent = `progress ${(state.p * 100).toFixed(0)}% · 手がかり ${n}/4 · 層 ${ridges.length}`;
      }
    };

    const onClick = (e: Event) => {
      const b = e.currentTarget as HTMLButtonElement;
      const k = b.dataset.cue as CueKey;
      on[k] = !on[k];
      b.setAttribute('aria-pressed', String(on[k]));
      applyCues();
      draw();
    };
    for (const b of buttons) b.addEventListener('click', onClick);

    // build() が呼ばれた = onClick が実際に効いているということなので、
    // render() が焼き込んだ「停止中」の見た目(disabled / title)を剥がし、
    // aria-pressed を現在の状態に合わせてライブなボタンに切り替える。
    for (const b of buttons) {
      b.disabled = false;
      b.removeAttribute('title');
      b.setAttribute('aria-pressed', String(on[b.dataset.cue as CueKey]));
    }

    tl.to(state, { p: 1, duration: 1, ease: 'none', onUpdate: draw });
    applyCues();
    draw();

    return () => {
      for (const b of buttons) b.removeEventListener('click', onClick);
      // 巻き戻し時に「押せそうに見えて実は死んでいるボタン」を残さないよう、
      // render() が焼き込んだ停止中の見た目に戻す。
      for (const b of buttons) {
        b.disabled = true;
        b.setAttribute('title', '動きを減らす設定のため停止中');
        b.removeAttribute('aria-pressed');
      }
    };
  },
};
