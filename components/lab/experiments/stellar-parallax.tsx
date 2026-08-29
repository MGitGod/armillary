import React from 'react';
import type { Experiment } from '../../../lib/lab';
import {
  ARCSEC_PX,
  STARS,
  ellipseAxes,
  isMeasurable,
  lightYears,
  parallaxOffset,
  parsecFromArcsec,
  pixelShift,
} from '../../../lib/parallax-astro';

/** 図の中で選んでおく星。地上から測れるうちで 2 番目に近い。 */
const FOCUS = STARS.findIndex((s) => s.name === 'Sirius');
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/** 遠景の星。視差 0 の基準として置く。決定的に散らす（SSR と一致させるため）。 */
const BACKDROP = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  return Array.from({ length: 150 }, () => ({
    cx: +(rnd() * 620).toFixed(1),
    cy: +(rnd() * 350).toFixed(1),
    r: +(rnd() * 0.9 + 0.25).toFixed(2),
  }));
})();

/**
 * 恒星視差。
 *
 * 見本帳では自動再生＋日付スライダーで作ったが、ラボでは捨てた。
 * **スクロール量を地球の公転位置そのものにする。**
 * 「スクロールしたから何かが動く」ではなく「観測者が動いたから星がずれる」になる。
 * 区間 1 本 = 1 年なので、スクロールを往復させると視差楕円を往復してなぞる。
 * scrub の性質がそのまま意味になる、シリーズで唯一の実験。
 *
 * 図の縮尺は 1" = 90px。実際の見かけの角度に対して極端な誇張で、
 * ESA の Gaia 解説動画も同じく約 1 万倍で描いている。誇張自体を画面に出す。
 *
 * ポラリスとベテルギウスはずれが 1px を切って測れない。
 * これが演出ではなく事実で、地上観測の限界 100 pc がそのまま図に出る。
 */
export const stellarParallax: Experiment = {
  id: 'stellar-parallax',
  title: 'Stellar Parallax',
  tech: ['視差楕円', 'scrub = 公転位相'],
  note: 'スクロールが観測の基線になる。近い星ほど大きな楕円を描き、遠い星は動かない。',
  length: 2.5,

  render: () => {
    const focus = STARS[FOCUS];
    const axes = ellipseAxes(focus.parallax, focus.eclipticLat);
    return (
      <div className="relative w-full max-w-4xl">
        <svg viewBox="0 0 620 350" className="block w-full border border-white/15">
          {/* 視差 0 の遠景。ここが動かないから、近い星の動きが読める。 */}
          <g fill="currentColor" className="text-white/30">
            {BACKDROP.map((s, i) => (
              <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
            ))}
          </g>

          {/* 黄道。楕円の潰れる向きの基準。 */}
          <path
            d="M0 232 C 150 208, 300 250, 620 196"
            fill="none" stroke="currentColor" strokeWidth={0.8}
            strokeDasharray="5 5" className="text-white/25"
          />
          <text x={10} y={224} fontSize={8.5} letterSpacing={1.6}
                className="fill-white/30 font-mono">ECLIPTIC</text>

          {/* 選んだ星の視差楕円。半軸は ϖ と ϖ·|sin β|。 */}
          <ellipse
            className="sp-ellipse"
            cx={focus.x} cy={focus.y}
            rx={axes.major * ARCSEC_PX} ry={axes.minor * ARCSEC_PX}
            fill="none" stroke="currentColor" strokeWidth={0.9}
            strokeDasharray="3 3" style={{ color: 'rgb(224 82 58)' }}
          />

          {STARS.map((s, i) => (
            <g key={s.name}>
              <g className="sp-star" data-i={i}>
                <circle r={s.mag} className="fill-white" />
                {i === FOCUS && (
                  <circle r={s.mag + 4} fill="none" strokeWidth={1}
                          stroke="currentColor" style={{ color: 'rgb(224 82 58)' }} />
                )}
              </g>
              <text x={s.x + 10} y={s.y - 8} fontSize={9} letterSpacing={0.6}
                    className="fill-white/40 font-mono">{s.name.toUpperCase()}</text>
            </g>
          ))}
        </svg>

        {/* 読み値。d = 1/ϖ がその場で走る。 */}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-white/40">
          <span>OBS <b className="sp-month font-medium text-white/80">1月</b></span>
          <span>ϖ = <b className="font-medium text-white/80">{focus.parallax.toFixed(4)}″</b></span>
          <span>d = 1/ϖ = <b className="font-medium text-white/80">
            {parsecFromArcsec(focus.parallax).toFixed(2)} pc</b></span>
          <span><b className="font-medium text-white/80">
            {lightYears(parsecFromArcsec(focus.parallax)).toFixed(2)} ly</b></span>
          <span className="text-white/25">1″ = {ARCSEC_PX}px（誇張）</span>
        </div>

        {/* 測れる／測れないを表で出す。地上観測の限界がそのまま出る。 */}
        <table className="mt-4 w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr className="text-white/25">
              {['星', 'ϖ ["]', 'd [pc]', 'd [ly]', '図上のずれ'].map((h, i) => (
                <th key={h} className={`border-b border-white/10 pb-1 font-normal ${i ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STARS.map((s) => {
              const pc = parsecFromArcsec(s.parallax);
              const ok = isMeasurable(s.parallax);
              return (
                <tr key={s.name} className={ok ? 'text-white/55' : 'text-white/25'}>
                  <td className="border-b border-white/5 py-1 text-left">{s.name}</td>
                  <td className="border-b border-white/5 py-1 text-right tabular-nums">{s.parallax.toFixed(4)}</td>
                  <td className="border-b border-white/5 py-1 text-right tabular-nums">{pc < 10 ? pc.toFixed(2) : Math.round(pc)}</td>
                  <td className="border-b border-white/5 py-1 text-right tabular-nums">
                    {lightYears(pc) < 10 ? lightYears(pc).toFixed(2) : Math.round(lightYears(pc))}
                  </td>
                  <td className="border-b border-white/5 py-1 text-right tabular-nums">
                    {ok ? `${pixelShift(s.parallax).toFixed(1)} px` : '< 1 px'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  },

  build: (tl, root) => {
    const stars = root.querySelectorAll<SVGGElement>('.sp-star');
    const month = root.querySelector<HTMLElement>('.sp-month');
    if (stars.length === 0) return;

    // 区間 1 本 = 1 年。theta を 0→2π へ回すだけで、あとは写像に任せる。
    const clock = { theta: 0 };
    tl.to(clock, {
      theta: Math.PI * 2,
      duration: 1,
      ease: 'none',
      onUpdate: () => {
        stars.forEach((g) => {
          const s = STARS[Number(g.dataset.i)];
          const o = parallaxOffset(s.parallax, s.eclipticLat, clock.theta);
          g.setAttribute(
            'transform',
            `translate(${(s.x + o.dx * ARCSEC_PX).toFixed(2)},${(s.y + o.dy * ARCSEC_PX).toFixed(2)})`,
          );
        });
        if (month) {
          const i = Math.floor((clock.theta / (Math.PI * 2)) * 12) % 12;
          month.textContent = MONTHS[(i + 12) % 12];
        }
      },
    });
  },
};
