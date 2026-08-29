import React from 'react';
import {
  BASELINE,
  EYE_Z,
  STAGE_H,
  STAGE_W,
  TARGET_Z,
  eyeXAt,
  layerDepth,
  readingAt,
  ridgeXAt,
  targetXAt,
} from '../../../lib/rangefinder';
import { setText, visibleLoop } from '../raf-loop';
import type { Experiment } from '../../../lib/lab';
import {
  RIDGE_LAYERS,
  cueFilter,
  depthCues,
  ridgeBox,
  ridgePath,
  ridgeTint,
  stepSpring,
  type Spring,
} from '../../../lib/parallax';

/**
 * 幾何と測距は lib/rangefinder.ts に置いてある（Node で検算できるようにするため）。
 * この場は座標を読んで DOM に書くだけにする。
 *
 * 行程 0 の値は render() が静止画として焼き込む。動きを減らす設定では
 * build() が呼ばれないので、ここで与えないと標的が SVG 原点に張り付く
 * （#11 で踏んだのと同じ穴）。
 */
const TARGET_X_AT_START = targetXAt(0);
const ridgeXAtStart = (z: number) => ridgeXAt(0, z);
const START = readingAt(0);

/**
 * 測距儀。四つの技法の融合であって、並置ではない。
 *
 * スクロールで観測者が基線上を移動する。すると 4 つが順に効く:
 *
 *   1. 4 層のシーンが非対称視錐台で張り直される（#13）── 平行移動ではなく本物のせん断
 *   2. 各層が深度ごとのばねで遅れて追従する（#14）── 動きに質量が出る
 *   3. 層が大気遠近を持つ（#12）── せん断が奥行きとして読める
 *   4. レチクルが標的のずれ角を読み、基線長から距離を算出する（#11）
 *
 * 4 が入ることで、他の 3 つが「距離を測るために必要な仕組み」になる。
 * 装飾を 4 つ重ねたのではなく、1 台の機械の部品として全部が要る。
 *
 * **#11 と同じ式を使う。** どちらも d = B/θ:
 *   #11 恒星視差 → B = 1 AU, θ = ϖ["] なので d[pc] = 1/ϖ
 *   #15 測距儀   → B = 基線長,  θ = 標的のずれ角
 * d = 1/ϖ は d = B/θ の特殊形にすぎない。シリーズの最初と最後が同じ式で閉じる。
 *
 * 実際の光学測距儀（合致式）も、固定基線の両端から見た像のずれで距離を出す機械。
 */
export const rangefinder: Experiment = {
  id: 'rangefinder',
  title: 'Rangefinder',
  tech: ['視錐台 + 大気遠近 + ばね', 'd = B/θ'],
  note: '四つが合わさって一台の機械になる。基線を移動し、ずれ角から距離を算出する。',
  length: 3.5,
  fade: false,

  render: () => (
    <div className="relative w-full max-w-4xl">
      <div
        className="rf-stage relative overflow-hidden border border-white/15"
        style={{ height: STAGE_H, background: 'linear-gradient(#12212e, #05090d)' }}
      >
        {RIDGE_LAYERS.map((L, i) => {
          const box = ridgeBox(L.height);
          const c = depthCues(L.z);
          return (
            <svg
              key={i}
              className="rf-ridge absolute block"
              data-z={L.z}
              viewBox={box.viewBox}
              preserveAspectRatio="none"
              style={{
                left: '-14%', width: '128%',
                height: box.height, bottom: box.bottom,
                zIndex: RIDGE_LAYERS.length - i,
                willChange: 'transform', transformOrigin: '50% 20%',
                // #12 と同じ絵。関数を共有して、片方だけ直して食い違うのを防ぐ。
                color: ridgeTint(L.z),
                filter: cueFilter(c),
                // 行程 0 の位置と縮尺。build() を通らない静止画のための初期値。
                transform: `translate3d(${ridgeXAtStart(L.z).toFixed(2)}px,0,0) scale(${c.scale})`,
              }}
            >
              <path d={ridgePath(L.phase, L.amp, L.base)} fill="currentColor" />
            </svg>
          );
        })}

        {/* 標的。奥に浮かぶ十字。これのずれ角を測る。 */}
        <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} preserveAspectRatio="none"
             className="pointer-events-none absolute inset-0" style={{ zIndex: 15 }}>
          <g
            className="rf-target"
            transform={`translate(${(STAGE_W / 2 + TARGET_X_AT_START).toFixed(2)},${STAGE_H / 2})`}
            style={{ color: 'rgb(224 82 58)' }}
          >
            <line x1={-16} y1={0} x2={16} y2={0} stroke="currentColor" strokeWidth={1.4} />
            <line x1={0} y1={-16} x2={0} y2={16} stroke="currentColor" strokeWidth={1.4} />
            <circle r={22} fill="none" stroke="currentColor" strokeWidth={0.7} opacity={0.6} />
          </g>
        </svg>

        {/* レチクル。標的が動いても、これは動かない。ずれ角はこの中心からの距離。 */}
        <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} preserveAspectRatio="none"
             className="pointer-events-none absolute inset-0" style={{ zIndex: 20 }}>
          <rect x={16} y={16} width={STAGE_W - 32} height={STAGE_H - 32}
                fill="none" stroke="currentColor" strokeWidth={1} className="text-white/20" />
          <line x1={STAGE_W / 2} y1={16} x2={STAGE_W / 2} y2={STAGE_H - 16}
                stroke="currentColor" strokeWidth={0.5} className="text-white/15" />
          <line x1={16} y1={STAGE_H / 2} x2={STAGE_W - 16} y2={STAGE_H / 2}
                stroke="currentColor" strokeWidth={0.5} className="text-white/15" />
          {Array.from({ length: 21 }, (_, i) => {
            const x = STAGE_W / 2 + (i - 10) * 22;
            const major = (i - 10) % 5 === 0;
            return (
              <line key={i} x1={x} y1={STAGE_H / 2 - (major ? 10 : 5)}
                    x2={x} y2={STAGE_H / 2 + (major ? 10 : 5)}
                    stroke="currentColor" strokeWidth={0.7} className="text-white/25" />
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-white/40">
        {/*
          初期値は行程 0 の実値そのもの。基線をまだ走査していないので
          B = 0、Δθ = 0、深度は未定義。動きを減らす設定でもこの表示で正しい。
        */}
        <span>基線 B = <b className="rf-b font-medium text-white/80">0</b> / {BASELINE}</span>
        <span>ずれ角 Δθ = <b className="rf-theta font-medium text-white/80">0.000</b></span>
        <span>推定深度 = <b className="rf-d font-medium" style={{ color: 'rgb(224 82 58)' }}>—</b></span>
        <span className="text-white/25">#11 と同じ式。d[pc] = 1/ϖ はこの B = 1 AU の場合</span>
      </div>
    </div>
  ),

  build: (tl, root) => {
    const ridges = Array.from(root.querySelectorAll<SVGElement>('.rf-ridge'));
    const target = root.querySelector<SVGGElement>('.rf-target');
    const readB = root.querySelector<HTMLElement>('.rf-b');
    const readT = root.querySelector<HTMLElement>('.rf-theta');
    const readD = root.querySelector<HTMLElement>('.rf-d');
    if (ridges.length === 0 || !target) return;

    // ばねの初期位置は render() が置いた行程 0 の位置に合わせる。
    // 0 から始めると、最初のフレームで静止画の位置から大きく飛ぶ。
    // 深度と縮尺は層ごとに固定なので、ループの外で 1 度だけ取る。
    // 毎フレーム dataset を読み直す必要はない。
    const zs = ridges.map((el) => Number(el.dataset.z));
    const scales = zs.map((z) => depthCues(z).scale);

    // ばねの初期位置は render() が置いた行程 0 の位置に合わせる。
    // 0 から始めると、最初のフレームで静止画の位置から大きく飛ぶ。
    const springs: Spring[] = zs.map((z) => ({ y: ridgeXAtStart(z), v: 0 }));
    const state = { p: 0 };

    const draw = (dt: number) => {
      // 行程の 0→1 で、観測者が基線の左端から右端へ移動する。
      ridges.forEach((el, i) => {
        const z = zs[i];
        // 層を「奥にある平面」として視錐台で張り直す。
        // 平行移動と違い、視点が寄った側の壁がせん断して手前に隠れる。
        // ばねで遅れて追従させる。深度ごとに剛性が違うので、動きに質量が出る。
        springs[i] = stepSpring(springs[i], ridgeXAt(state.p, z), z, dt);
        el.style.transform =
          `translate3d(${springs[i].y.toFixed(2)}px,0,0) scale(${scales[i]})`;
      });

      // 標的。レチクル中心からのずれがそのまま測る量になる。
      target.setAttribute(
        'transform',
        `translate(${(STAGE_W / 2 + targetXAt(state.p)).toFixed(2)},${STAGE_H / 2})`,
      );

      // 測距。基線は「最初の観測からどれだけ走査したか」、
      // ずれ角は「消失点基準の標的位置が、最初の観測からどれだけ動いたか」で取る。
      //
      // 中央からの距離で測ってはいけない。それだと基線が減ってから増える形になり、
      // 死角が区間の中央に来るうえ、B も Δθ も |eyeX| に比例するので比が定数になり、
      // 「測っている」ことにならない。
      //
      // 逆算の式:
      //   t  = EYE_Z / (EYE_Z + |Z|)、消失点基準の標的位置 rel = −eyeX·t
      //   Δθ = |rel − rel0| = t·B  →  EYE_Z·B/Δθ = EYE_Z/t = EYE_Z + |Z|
      //   ∴ |Z| = EYE_Z·B/Δθ − EYE_Z
      // これで機械が標的の深度 430 を復元する（TARGET_Z の真値）。
      const { B, shift, depth } = readingAt(state.p);
      setText(readB, B.toFixed(0));
      setText(readT, shift.toFixed(3));
      setText(readD, depth === null ? '—' : depth.toFixed(0));
    };

    // タイムラインは目標（state.p）を動かすだけ。積分は rAF が持つ。
    //
    // ばねを onUpdate の中で積分してはいけない。scrub された onUpdate は
    // **スクロールが止まると呼ばれなくなる**ので、ばねが収束せず途中で凍る。
    // 「止めても奥の層はまだ沈んでいる」という #14 の売りが、ここで逆に壊れる。
    // #14 を pin:false + Component にしたのと同じ理由が、build の中でも効く。
    tl.to(state, { p: 1, duration: 1, ease: 'none' });

    // 画面に入っているあいだだけ回す。ラボは 15 セクションを同時にマウントするので、
    // これが無いと別の実験を見ているあいだも積分し続ける。
    return visibleLoop(root, draw);
  },
};
