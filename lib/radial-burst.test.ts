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
  predictSteps,
  progressAt,
  radiusAt,
  willCollide,
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

test('刻み数は相対速度から逆算され、固定値ではない', () => {
  const slow = card({ speed: 0.156, size: 0.13, rho: 0.092 });
  const fast = card({ speed: 0.364, size: 0.13, rho: 0.092 });

  // 速い組み合わせのほうが細かく刻む
  const a = predictSteps(slow, slow, 5, DEFAULTS.margin);
  const b = predictSteps(fast, fast, 5, DEFAULTS.margin);
  assert.ok(b > a, `速いほうが粗い: slow=${a} fast=${b}`);

  // 見る時間が長いほど細かく刻む
  assert.ok(
    predictSteps(fast, fast, 10, DEFAULTS.margin) >
      predictSteps(fast, fast, 5, DEFAULTS.margin),
  );

  // 小さい札（判定距離が短い）ほど細かく刻む
  const small = card({ speed: 0.26, size: 0.104, rho: (0.104 * Math.SQRT2) / 2 });
  const big = card({ speed: 0.26, size: 0.156, rho: (0.156 * Math.SQRT2) / 2 });
  assert.ok(
    predictSteps(small, small, 5, DEFAULTS.margin) >
      predictSteps(big, big, 5, DEFAULTS.margin),
  );

  // 下限 8 は必ず守る
  assert.equal(predictSteps(slow, slow, 0.001, DEFAULTS.margin), 8);
});

test('1 ステップの相対移動量が、判定距離の 40% を超えない', () => {
  // 実際に取りうる範囲を総当たりする。速度 ±40%、一辺 ±20%、行程はほぼ最長まで。
  const speeds = [0.156, 0.26, 0.364];
  const sizes = [0.104, 0.13, 0.156];
  const horizons = [0.5, 2, 5, 12];

  for (const sa of speeds) {
    for (const sb of speeds) {
      for (const za of sizes) {
        for (const zb of sizes) {
          for (const horizon of horizons) {
            const a = card({ speed: sa, size: za, rho: (za * Math.SQRT2) / 2 });
            const b = card({ speed: sb, size: zb, rho: (zb * Math.SQRT2) / 2 });
            const steps = predictSteps(a, b, horizon, DEFAULTS.margin);
            // 上限 600 に張り付いたら保証できない。実運用の範囲では張り付かないはず。
            assert.ok(steps < 600, `刻み数が上限に張り付いた: ${steps}`);

            const lim = (a.rho + b.rho) * DEFAULTS.margin;
            const vRel = 2 * (a.speed + b.speed);
            const perStep = (horizon / steps) * vRel;
            assert.ok(
              perStep <= 0.4 * lim + 1e-12,
              `1 ステップ ${perStep.toFixed(5)} > 判定距離の 40% ${(0.4 * lim).toFixed(5)}`,
            );
          }
        }
      }
    }
  }
});

test('同じ角度で追いかける 2 枚は重なると判定される', () => {
  // 先に出た遅い札を、あとから出た速い札が追う。追い越しはサンプル間で起きやすい。
  const slow = card({ angle: 0, r0: 0.09, r1: 1, speed: 0.16, born: 0, life: (1 - 0.09) / 0.16 });
  const fast = card({ id: 1, angle: 0, r0: 0.09, r1: 1, speed: 0.36, born: 1, life: (1 - 0.09) / 0.36 });
  const horizon = Math.min(slow.born + slow.life, fast.born + fast.life) - 1;
  assert.equal(willCollide(fast, slow, 1, horizon, DEFAULTS.margin), true);
});

test('真反対へ飛ぶ 2 枚は重ならない', () => {
  // 誕生時刻を発生間隔ぶんずらすこと。**同時に産まれた 2 枚は必ず衝突と判定される** ──
  // 出発半径が外接円の半径なので、同時誕生の 2 枚の中心間距離は真反対でも 2·rho
  // にしかならず、判定距離 2·rho·1.18 を必ず下回る。
  // これは実装のバグではなく「中心付近には原理的に 1 枚しか置けない」ことの現れ。
  const life = (1 - 0.092) / 0.26;
  const east = card({ angle: 0, r0: 0.092, r1: 1, born: 0, life });
  const west = card({ id: 1, angle: Math.PI, r0: 0.092, r1: 1, born: 0.18, life });

  const t = 0.18;
  const horizon = Math.min(east.born + east.life, west.born + west.life) - t;
  assert.ok(horizon > 0);
  assert.equal(willCollide(east, west, t, horizon, DEFAULTS.margin), false);
});

test('horizon が 0 以下なら、もう交わりようがないので false', () => {
  const a = card({ angle: 0 });
  const b = card({ id: 1, angle: 0 });
  assert.equal(willCollide(a, b, 0, 0, DEFAULTS.margin), false);
  assert.equal(willCollide(a, b, 0, -1, DEFAULTS.margin), false);
});

test('margin は、判定円を実際より大きく取る倍率として効く', () => {
  // 先に出た札が外周近くまで進んだところへ、30° 離して次の札を出す。
  // 距離は最接近が horizon の端に来る組み合わせなので、粗い刻みでも取りこぼさない。
  const life = (1 - 0.092) / 0.26;
  const a = card({ angle: 0, r0: 0.092, r1: 1, born: 0, life });
  const b = card({ id: 1, angle: (30 * Math.PI) / 180, r0: 0.092, r1: 1, born: 3, life });

  const t = 3;
  const horizon = Math.min(a.born + a.life, b.born + b.life) - t;
  assert.ok(horizon > 0);

  // この 2 枚が実際どこまで近づくかを、予測器を使わずに細かく測る。
  // 予測器で予測器を検算しないため。
  let minD = Infinity;
  for (let i = 0; i <= 20000; i++) {
    const tt = t + (horizon * i) / 20000;
    const pa = positionAt(a, tt);
    const pb = positionAt(b, tt);
    minD = Math.min(minD, Math.hypot(pa.x - pb.x, pa.y - pb.y));
  }
  const touch = a.rho + b.rho;

  // 判定円が最接近より小さければ通り、大きければ弾かれる
  assert.equal(willCollide(a, b, t, horizon, (minD / touch) * 0.9), false);
  assert.equal(willCollide(a, b, t, horizon, (minD / touch) * 1.5), true);
});
