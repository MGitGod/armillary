/**
 * @file raf-loop.ts
 * @description ラボの実験が共有する DOM まわりの小道具。
 *
 * `lib/` は純粋関数だけと決めてあるので（DOM も window も持たない）、
 * IntersectionObserver や textContent を触るものはここに置く。
 */

/**
 * 値が変わったときだけ書く textContent。
 *
 * セッターは同じ文字列でも子テキストノードを毎回置換するので、
 * 毎フレーム無条件に書くとレイアウトに影響する更新が 60〜144Hz で走る。
 * 「transform と opacity 以外を毎フレーム動かさない」を守るための道具。
 */
export const setText = (el: { textContent: string | null } | null, v: string) => {
  if (el && el.textContent !== v) el.textContent = v;
};

/**
 * 画面に入っているあいだだけ回す rAF ループ。
 *
 * ラボは 15 セクションを同時にマウントするので、自前のループを持つ実験は
 * 別の実験を見ているあいだも回り続ける。`Ornament.tsx` が既に
 * 「画面外では時計ごと止める」を IntersectionObserver でやっているので、それに揃える。
 *
 * `step` には前フレームからの経過秒（上限 0.05 秒）を渡す。
 * 画面外から戻ったときは計時をやり直すので、巨大な dt が飛び込むことはない。
 *
 * @param target 可視性を見る要素
 * @param step   毎フレーム呼ぶ処理
 * @returns 後始末。observer とループの両方を止める
 */
export const visibleLoop = (target: Element, step: (dt: number) => void) => {
  let raf = 0;
  let prev = 0;
  let alive = true;

  const frame = (now: number) => {
    if (!alive) return;
    // 復帰直後は prev が古いので、その 1 フレームだけ既定値を使う
    const dt = prev ? Math.min((now - prev) / 1000, 0.05) : 1 / 60;
    prev = now;
    step(dt);
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (raf || !alive) return;
    prev = 0;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  // rootMargin を持たせて、画面に入る少し手前から動かし始める。
  // 境界ぴったりで起こすと、入った瞬間に静止した絵が見えてしまう。
  const io = new IntersectionObserver(
    ([entry]) => (entry.isIntersecting ? start() : stop()),
    { rootMargin: '15%' },
  );
  io.observe(target);

  return () => {
    alive = false;
    io.disconnect();
    stop();
  };
};
