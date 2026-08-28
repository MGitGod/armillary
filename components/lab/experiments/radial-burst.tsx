"use client";
import React, { useEffect, useRef } from 'react';
import { gsap } from '../../../lib/gsap-config';
import { createBurst, opacityAt, positionAt } from '../../../lib/radial-burst';
import { lissajousPath, polygonPath, rosePath } from '../../../lib/curves';
import { ticks } from '../../../lib/orbital';
import type { Experiment } from '../../../lib/lab';

/** viewBox 100 の中での盤の半径。R = min(幅, 高さ) × 0.40 に対応する。 */
const R_UNIT = 40;
/** 札の図版 SVG の内部座標と、図版の半径。 */
const FACE = 120;
const FIG = 46;
/** 動きを減らす設定のとき、ここまで進めた 1 コマを静止画として置く(s)。 */
const STILL_AT = 7;

const NS = 'http://www.w3.org/2000/svg';

/**
 * 札の図版。lib/curves.ts の手続き的な曲線をそのまま SVG に流す。
 *
 * 奇数 k のバラ曲線は θ∈[0,π] で閉じるので turns は 0.5。
 * 1 にすると同じ線を 2 重に描くことになり、小さく描いたときに線間が潰れて図形が読めなくなる
 * （既存 spec「小さく描く SVG は線幅と重ね描きで消える」の教訓）。
 *
 * 種類数は lib 側の DEFAULTS.variants (= 6) と揃えること。
 *
 * 6 つとも引数は定数なので、モジュール読み込み時に 1 度だけ計算して文字列で持つ。
 * rosePath / lissajousPath / polygonPath は純粋関数で DOM に触れないので、
 * モジュールスコープでの評価は安全（札を作るたびに ~5KB のパス文字列を作り直していた）。
 */
const FIGURES: string[] = [
  rosePath(3, FIG, 480, 0.5),
  rosePath(5, FIG, 480, 0.5),
  rosePath(2, FIG, 480, 1),
  lissajousPath(3, 2, Math.PI / 2, FIG, 480),
  lissajousPath(5, 4, Math.PI / 4, FIG, 480),
  polygonPath(6, FIG, 120),
];

/**
 * 札の中身。**ここが要件 9 の差し替え口。**
 * 作品版ではこの関数が `<img>` を返すようになる。
 * DOM を選んだ理由がここに効く（Canvas なら全部あとから作り直しになる）。
 */
const makeFace = (variant: number): SVGSVGElement => {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${-FACE / 2} ${-FACE / 2} ${FACE} ${FACE}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', FIGURES[variant % FIGURES.length]);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.1');
  // 札は 40px 前後まで小さくなる。viewBox 単位のままだとサブピクセルになって消える。
  path.setAttribute('vector-effect', 'non-scaling-stroke');

  svg.appendChild(path);
  return svg;
};

/**
 * 外周の目盛り。Orrery と同じ `ticks(72, 6)` ── 5° 刻み、30° ごとに長い罫。
 * 刻みは繋がっていないので「実線ではない」（要件 8）。
 * Orrery / IndexDial と同じ計器の言語なので、サイト全体と揃う。
 *
 * 座標は定数と四則だけで出る。sin/cos と違ってサーバーとブラウザでビットが一致するので、
 * ハイドレーションのための丸めは要らない。
 */
const RIM_TICKS = ticks(72, 6).map((tk) => (
  <line
    key={tk.angle}
    x1={0}
    y1={-(R_UNIT + 1.4)}
    x2={0}
    y2={-(R_UNIT + 1.4 + (tk.major ? 2.8 : 1.2))}
    transform={`rotate(${tk.angle})`}
    stroke="currentColor"
    strokeWidth={tk.major ? 1.1 : 0.6}
    vectorEffect="non-scaling-stroke"
    opacity={tk.major ? 0.45 : 0.18}
  />
));

export type RadialBurstStageProps = {
  /**
   * 札の向き。'radial' は進行方向へ整列（魅せる側）、'upright' は正立（作品を置く側）。
   * 当たり判定は外接円なので、切り替えても重なり保証は変わらない。
   */
  orientation?: 'radial' | 'upright';
  /**
   * true にすると札が外周に達しても消えない（作品版）。
   * 札が溜まり続けるので「時間とともに空く」前提が崩れる。**重なり保証は未検証。**
   */
  persist?: boolean;
};

/**
 * 中心から放射して消えていく札。
 *
 * 不可視の円がある。中心付近で札がふっと現れ、自分の角度の方向へ真っすぐ外へ滑る。
 * 外へ行くほど薄れ、あるものは途中で消え、あるものは外周まで届く。
 * **線は一本も引かれていない。中心も外周も、動きだけが図形を示す。**
 *
 * 幾何と発生の規則は lib/radial-burst.ts が全部持っている。ここは
 * 「R 比を px に掛けて DOM に書く」だけの機械。長さを R 比で持っているおかげで、
 * リサイズは掛ける数が変わるだけになり、状態を測り直さなくてよい。
 *
 * 連続的に湧き続けるエミッタはスクロールの scrub と相性が悪い
 * （scrub は「t を与えたら状態が一意に決まる」ことを要求する）ので、
 * Orrery / Paper Sphere と同じく pin: false ＋ Component にしている。
 */
export function RadialBurstStage({
  orientation = 'radial',
  persist = false,
}: RadialBurstStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const layer = layerRef.current;
    if (!host || !layer) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const burst = createBurst({ seed: Math.floor(Math.random() * 1e9), persist });
    const nodes = new Map<number, HTMLDivElement>();

    /** 盤の半径(px)。 */
    let R = 0;
    /** 札の寸法を書いたときの R。変わったときだけ書き直す（毎フレームのレイアウトを避ける）。 */
    let sizedAt = -1;

    const measure = () => {
      R = Math.min(host.clientWidth, host.clientHeight) * 0.4;
    };

    /** 生きている札に DOM を合わせる。 */
    const sync = () => {
      const resized = R !== sizedAt;
      const alive = new Set<number>();

      for (const c of burst.cards) {
        alive.add(c.id);
        let el = nodes.get(c.id);

        if (!el) {
          el = document.createElement('div');
          // Tailwind v4 はソースを文字列として走査する。この並びを 1 つの文字列リテラル
          // のまま置くこと。分割して連結するとクラスが生成されず、札が消える。
          el.className = 'absolute left-1/2 top-1/2 text-white/85';
          el.style.willChange = 'transform, opacity';
          el.style.opacity = '0';
          el.appendChild(makeFace(c.variant));
          layer.appendChild(el);
          nodes.set(c.id, el);
        } else if (!resized) {
          continue;
        }

        const px = c.size * R;
        el.style.width = `${px.toFixed(2)}px`;
        el.style.height = `${px.toFixed(2)}px`;
      }
      sizedAt = R;

      for (const [id, el] of nodes) {
        if (!alive.has(id)) {
          el.remove();
          nodes.delete(id);
        }
      }
    };

    /** 位置と濃さを書く。60fps で走るのはここだけ。state は一切触らない。 */
    const paint = () => {
      const t = burst.time;
      for (const c of burst.cards) {
        const el = nodes.get(c.id);
        if (!el) continue;

        const p = positionAt(c, t);
        // 画面は下が正だが、放射は回転対称なので符号を反転させる必要はない。
        // CSS の rotate も同じ向きに回るので、角度をそのまま渡せば進行方向に整列する。
        const deg = orientation === 'radial' ? (c.angle * 180) / Math.PI : 0;

        el.style.transform =
          `translate(-50%,-50%) translate(${(p.x * R).toFixed(2)}px,${(p.y * R).toFixed(2)}px)` +
          ` rotate(${deg.toFixed(2)}deg)`;
        el.style.opacity = opacityAt(c, t).toFixed(3);
      }
    };

    const ro = new ResizeObserver(() => {
      measure();
      sync();
      paint();
    });
    ro.observe(host);
    measure();

    const tick = (_time: number, delta: number) => {
      // タブ復帰の巨大な delta をそのまま渡すと一気に時間が飛ぶ。
      burst.step(Math.min(delta, 50) / 1000);
      sync();
      paint();
    };

    if (reduced) {
      // 動かさない。ただし何も無いと図が成立しないので、決まった時刻まで進めた 1 コマを置く。
      const dt = 1 / 60;
      for (let i = 0; i < Math.round(STILL_AT / dt); i++) burst.step(dt);
      sync();
      paint();
    } else {
      gsap.ticker.add(tick);
    }

    // 開発時のみ、コマ送りとエミッタの中身をコンソールから触れるようにする。
    // アニメーションは実際に動かさないと詰められないので。
    if (process.env.NODE_ENV !== 'production') {
      Object.assign(window as unknown as Record<string, unknown>, {
        radialBurst: {
          burst,
          step: (seconds: number) => {
            burst.step(seconds);
            sync();
            paint();
          },
        },
      });
    }

    return () => {
      ro.disconnect();
      gsap.ticker.remove(tick);
      for (const el of nodes.values()) el.remove();
      nodes.clear();
    };
  }, [orientation, persist]);

  return (
    <div
      ref={hostRef}
      // touch-none は付けない。ポインタ操作が無い上、画面いっぱいの要素に付けると
      // タッチでスクロールできなくなる（Paper Sphere と同じ判断）。
      className="relative aspect-square w-full max-w-[min(90vw,74vh)]"
    >
      {/* 濃度。中心がほのかに明るく外へ沈む。線を 1 本も引かないまま円が立つ（要件 8）。 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.075) 0%,' +
            ' rgba(255,255,255,0.032) 46%, rgba(255,255,255,0.008) 70%,' +
            ' rgba(255,255,255,0) 82%)',
        }}
      />

      {/* 外周の目盛り。 */}
      <svg
        viewBox="-50 -50 100 100"
        className="pointer-events-none absolute inset-0 h-full w-full text-white"
      >
        {RIM_TICKS}
      </svg>

      {/* 札はここに生える。client でしか生えないので初期 DOM は空 ──
          SSR 由来のハイドレーション不一致は起きない。
          data 属性は検証用の取っ手（クラス名の並びに依存せず掴めるように）。 */}
      <div ref={layerRef} data-burst-layer="" className="absolute inset-0" />
    </div>
  );
}

export const radialBurst: Experiment = {
  id: 'radial-burst',
  title: 'Radial Burst',
  tech: ['黄金角', '衝突予測', 'DOM + SVG'],
  note: '中心から放射して消えていく札。線は一本も引かれていない。中心も外周も動きだけが示す。',
  pin: false,
  Component: RadialBurstStage,
};
