import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCSEC_PX,
  LY_PER_PC,
  STARS,
  ellipseAxes,
  isMeasurable,
  lightYears,
  parallaxOffset,
  parsecFromArcsec,
  pixelShift,
} from './parallax-astro.ts';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test('黄道の極では真円、黄道面上では直線に退化する', () => {
  const p = 0.5;
  for (const beta of [90, -90]) {
    const e = ellipseAxes(p, beta);
    assert.ok(near(e.major, e.minor), `β=${beta} で真円にならない`);
  }
  const flat = ellipseAxes(p, 0);
  assert.ok(near(flat.major, p));
  assert.ok(near(flat.minor, 0), '黄道面上では短軸が 0（直線）');
});

test('半軸は ϖ と ϖ·|sin β|', () => {
  const e = ellipseAxes(0.3792, -39.6);
  assert.ok(near(e.major, 0.3792));
  assert.ok(near(e.minor, 0.3792 * Math.abs(Math.sin((-39.6 * Math.PI) / 180))));
  assert.ok(e.minor > 0, '負の黄緯でも短軸は正');
});

test('一年で楕円を一周し、なぞる範囲が半軸に一致する', () => {
  const p = 0.4, beta = 30;
  const e = ellipseAxes(p, beta);
  let maxX = -Infinity, maxY = -Infinity;
  const N = 720;
  for (let i = 0; i < N; i++) {
    const o = parallaxOffset(p, beta, (i / N) * Math.PI * 2);
    maxX = Math.max(maxX, Math.abs(o.dx));
    maxY = Math.max(maxY, Math.abs(o.dy));
  }
  assert.ok(near(maxX, e.major, 1e-4));
  assert.ok(near(maxY, e.minor, 1e-4));
  // 一周して元に戻る
  const a = parallaxOffset(p, beta, 0);
  const b = parallaxOffset(p, beta, Math.PI * 2);
  assert.ok(near(a.dx, b.dx, 1e-9) && near(a.dy, b.dy, 1e-9));
});

test('d = 1/ϖ。これは d = B/θ の B = 1 AU, θ = 秒角 という特殊形', () => {
  assert.ok(near(parsecFromArcsec(1), 1), '1 秒角 = 1 パーセク');
  assert.ok(near(parsecFromArcsec(0.5), 2));
  assert.ok(near(lightYears(1), LY_PER_PC));
});

test('6 星の距離が実測値と一致する（有効数字 3 桁）', () => {
  const expect: Record<string, [number, number]> = {
    // 名前: [pc, ly]
    'Proxima Centauri': [1.30, 4.24],
    Sirius: [2.64, 8.60],
    Altair: [5.13, 16.7],
    Vega: [7.68, 25.0],
    Polaris: [132, 429],
    Betelgeuse: [182, 593],
  };
  assert.equal(STARS.length, 6);
  for (const s of STARS) {
    const [pc, ly] = expect[s.name];
    const got = parsecFromArcsec(s.parallax);
    assert.ok(Math.abs(got - pc) / pc < 0.005, `${s.name}: ${got} pc（期待 ${pc}）`);
    const gotLy = lightYears(got);
    assert.ok(Math.abs(gotLy - ly) / ly < 0.005, `${s.name}: ${gotLy} ly（期待 ${ly}）`);
  }
});

test('地上観測の限界がそのまま図に出る。測れないのは 2 星だけ', () => {
  const out = STARS.filter((s) => !isMeasurable(s.parallax));
  assert.deepEqual(out.map((s) => s.name).sort(), ['Betelgeuse', 'Polaris']);
  // 測れない星は 100 pc より遠い
  for (const s of out) assert.ok(parsecFromArcsec(s.parallax) > 100);
  // 測れる星は 1px 以上ずれる
  for (const s of STARS.filter((x) => isMeasurable(x.parallax))) {
    assert.ok(pixelShift(s.parallax) >= 1);
  }
});

test('図上のずれは縮尺に比例する', () => {
  assert.ok(near(pixelShift(0.3792), 0.3792 * ARCSEC_PX));
  assert.ok(near(pixelShift(0.5, 100), 50));
});

test('星の配置とデータが図に載る形で揃っている', () => {
  for (const s of STARS) {
    assert.ok(s.parallax > 0, `${s.name}: 視差が正`);
    assert.ok(Math.abs(s.eclipticLat) <= 90, `${s.name}: 黄緯が範囲内`);
    assert.ok(s.x >= 0 && s.x <= 620, `${s.name}: x が viewBox 内`);
    assert.ok(s.y >= 0 && s.y <= 350, `${s.name}: y が viewBox 内`);
    assert.ok(s.mag > 0, `${s.name}: 描画半径が正`);
  }
  // 近い順に並べておく（表の並びをコード側で保証する）
  for (let i = 1; i < STARS.length; i++) {
    assert.ok(STARS[i].parallax <= STARS[i - 1].parallax, '視差の降順＝近い順');
  }
});

test('黄道の極（β=±90）で parallaxOffset の軌跡は真円になる', () => {
  const p = 0.5;
  const thetas = [0, Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  for (const beta of [90, -90]) {
    for (const theta of thetas) {
      const o = parallaxOffset(p, beta, theta);
      const r2 = o.dx * o.dx + o.dy * o.dy;
      assert.ok(near(r2, p * p, 1e-9), `β=${beta}, θ=${theta}: r²=${r2}, p²=${p * p}`);
    }
  }
});

test('黄道面上（β=0）で parallaxOffset の軌跡は直線に退化する', () => {
  const p = 0.5;
  const thetas = [0, Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  for (const theta of thetas) {
    const o = parallaxOffset(p, 0, theta);
    assert.ok(near(o.dy, 0, 1e-9), `β=0, θ=${theta}: dy=${o.dy}（0 であるべき）`);
  }
});
