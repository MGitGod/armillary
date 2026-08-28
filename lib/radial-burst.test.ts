import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  FADE_IN_END,
  FADE_OUT_START,
  GOLDEN_ANGLE_DEG,
  easeOut,
  makeRandom,
  maxAngularGap,
  opacityAt,
  positionAt,
  progressAt,
  radiusAt,
  type Card,
} from './radial-burst.ts';

/** テスト用の 1 枚。個別のテストで必要なところだけ上書きする。 */
const card = (over: Partial<Card> = {}): Card => ({
  id: 0,
  angle: 0,
  r0: 0.1,
  r1: 0.8,
  size: 0.13,
  rho: 0.092,
  speed: 0.26,
  born: 0,
  life: 2,
  variant: 0,
  persist: false,
  ...over,
});

test('確定値が設計書どおり', () => {
  assert.equal(DEFAULTS.speed, 0.26);
  assert.equal(DEFAULTS.speedJitter, 0.4);
  assert.equal(DEFAULTS.spawnInterval, 0.18);
  assert.equal(DEFAULTS.cardSize, 0.13);
  assert.equal(DEFAULTS.cardJitter, 0.2);
  assert.equal(DEFAULTS.reachMin, 0.5);
  assert.equal(DEFAULTS.reachMax, 1);
  assert.equal(DEFAULTS.margin, 1.18);
  assert.equal(DEFAULTS.angleJitterDeg, 8.6);
  assert.equal(DEFAULTS.maxCandidates, 14);
  assert.equal(FADE_IN_END, 0.16);
  assert.equal(FADE_OUT_START, 0.55);
  // Orrery の初期位相・Paper Sphere のフィボナッチ球と同じ値であること
  assert.equal(GOLDEN_ANGLE_DEG, 137.50776405003785);
});

test('減速カーブの初速は平均の 2 倍（予測の刻み数がこの 2 を使う）', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  // easeOut(0.5) = 0.75。半分の時間で 3/4 まで進む
  assert.equal(easeOut(0.5), 0.75);
  // 0 近傍の傾き ≒ 2
  assert.ok(Math.abs(easeOut(1e-6) / 1e-6 - 2) < 1e-4);
});

test('行程と半径の写像', () => {
  const c = card();
  assert.equal(progressAt(c, 0), 0);
  assert.equal(progressAt(c, 1), 0.5);
  assert.equal(progressAt(c, 2), 1);

  assert.ok(Math.abs(radiusAt(c, 0) - 0.1) < 1e-12);
  assert.ok(Math.abs(radiusAt(c, 2) - 0.8) < 1e-12);
  // 減速なので、半分の時間で距離の 3/4
  assert.ok(Math.abs(radiusAt(c, 1) - (0.1 + 0.7 * 0.75)) < 1e-12);
  // 行程の外へはみ出しても外周を越えないし、内へも戻らない
  assert.ok(Math.abs(radiusAt(c, 99) - 0.8) < 1e-12);
  assert.ok(Math.abs(radiusAt(c, -99) - 0.1) < 1e-12);
});

test('不透明度は 0→16% で立ち上がり 55%→100% で落ちる', () => {
  const c = card();
  assert.equal(opacityAt(c, 0), 0);
  assert.ok(Math.abs(opacityAt(c, 2 * 0.08) - 0.5) < 1e-12);
  assert.ok(Math.abs(opacityAt(c, 2 * 0.16) - 1) < 1e-12);
  assert.equal(opacityAt(c, 2 * 0.35), 1);
  assert.equal(opacityAt(c, 2 * 0.55), 1);
  // (1 - 0.775) / (1 - 0.55) = 0.5
  assert.ok(Math.abs(opacityAt(c, 2 * 0.775) - 0.5) < 1e-9);
  assert.equal(opacityAt(c, 2), 0);
});

test('persist の札は消えず、不透明度が 1 のまま留まる', () => {
  const c = card({ persist: true });
  assert.equal(opacityAt(c, 0), 0);
  assert.ok(Math.abs(opacityAt(c, 2 * 0.16) - 1) < 1e-12);
  assert.equal(opacityAt(c, 2 * 0.9), 1);
  assert.equal(opacityAt(c, 99), 1);
});

test('座標は自分の角度の方向へ真っすぐ', () => {
  const right = positionAt(card({ angle: 0 }), 2);
  assert.ok(Math.abs(right.x - 0.8) < 1e-12);
  assert.ok(Math.abs(right.y) < 1e-12);

  const down = positionAt(card({ angle: Math.PI / 2 }), 2);
  assert.ok(Math.abs(down.x) < 1e-12);
  assert.ok(Math.abs(down.y - 0.8) < 1e-12);
});

test('角度の空きの測り方', () => {
  const at = (deg: number) => card({ angle: (deg * Math.PI) / 180 });
  assert.ok(Math.abs(maxAngularGap([at(0), at(90), at(180), at(270)]) - 90) < 1e-9);
  // 折り返しをまたぐ隙間も見る
  assert.ok(Math.abs(maxAngularGap([at(10), at(20)]) - 350) < 1e-9);
  // 1 枚しか居ない／居ないときは「全部空いている」
  assert.equal(maxAngularGap([at(42)]), 360);
  assert.equal(maxAngularGap([]), 360);
  // 負の角度・1 周を超える角度も畳む
  assert.ok(Math.abs(maxAngularGap([at(-90), at(90), at(450)]) - 180) < 1e-9);
});

test('同じシードは同じ列を返し、違うシードは違う列を返す', () => {
  const a = makeRandom(7);
  const b = makeRandom(7);
  const c = makeRandom(8);
  const xs = Array.from({ length: 200 }, () => a());
  const ys = Array.from({ length: 200 }, () => b());
  const zs = Array.from({ length: 200 }, () => c());
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, zs);
  // 0 以上 1 未満に収まる
  assert.ok(xs.every((v) => v >= 0 && v < 1));
  // 平均が 0.5 の近く（極端に偏った PRNG を弾く）
  assert.ok(Math.abs(xs.reduce((s, v) => s + v, 0) / xs.length - 0.5) < 0.06);
});
