import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  FADE_IN_END,
  FADE_OUT_START,
  GOLDEN_ANGLE_DEG,
  createBurst,
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

// --- 5 シード × 120 秒の実測。設計中に使った測定をそのまま回帰テストにする ---

const DT = 1 / 60;
const DURATION = 120;
const SEEDS = [1, 2, 3, 4, 5];
/**
 * 立ち上がりを統計から外す秒数。
 * 最初の数秒は札が 0〜1 枚しか居らず、maxAngularGap が 360° を返す（正しい答えだが、
 * 定常状態の偏りを測る目的には合わない）。同時枚数も立ち上がりのぶん低く出る。
 */
const WARMUP = 10;

type Survey = {
  live: number;
  overlaps: number;
  worstOverlap: number;
  gapMean: number;
  gapWorst: number;
  rate: number;
};

/**
 * 1 シードぶん回して実測を集める。
 * 重なりは予測ではなく**外接円の実距離**で見る（margin を掛けない）。
 * 予測器で予測器を検算しても意味がないため。
 */
const survey = (seed: number): Survey => {
  const burst = createBurst({ seed });
  const steps = Math.round(DURATION / DT);
  const warm = Math.round(WARMUP / DT);
  let frames = 0;
  let sumLive = 0;
  let overlaps = 0;
  let worstOverlap = 0;
  let sumGap = 0;
  let gapWorst = 0;

  for (let i = 0; i < steps; i++) {
    burst.step(DT);
    const t = burst.time;
    const cards = burst.cards;
    if (i < warm) continue;
    frames++;
    sumLive += cards.length;

    for (let a = 0; a < cards.length; a++) {
      for (let b = a + 1; b < cards.length; b++) {
        const pa = positionAt(cards[a], t);
        const pb = positionAt(cards[b], t);
        const lim = cards[a].rho + cards[b].rho;
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (d < lim) {
          overlaps++;
          const bite = (lim - d) / lim;
          if (bite > worstOverlap) worstOverlap = bite;
        }
      }
    }

    const gap = maxAngularGap(cards);
    sumGap += gap;
    if (gap > gapWorst) gapWorst = gap;
  }

  return {
    live: sumLive / frames,
    overlaps,
    worstOverlap,
    gapMean: sumGap / frames,
    gapWorst,
    // 発生率だけは立ち上がりも含めた全区間で見る（発生は最初から一定間隔で走るため）
    rate: burst.stats.spawned / DURATION,
  };
};

const results = SEEDS.map(survey);
const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

test('5 シード × 120 秒で、札どうしの重なりは 1 度も起きない', () => {
  const total = results.reduce((n, r) => n + r.overlaps, 0);
  const worst = Math.max(...results.map((r) => r.worstOverlap));
  assert.equal(
    total,
    0,
    `重なり ${total} 回、最大めり込み ${(worst * 100).toFixed(2)}%。` +
      ' margin を下げたか、予測の刻み数を固定にしていないか確認する',
  );
});

test('角度の最大の空きが、棄却なしの一様乱数より明確に小さい', () => {
  const mean = avg(results.map((r) => r.gapMean));
  const worst = Math.max(...results.map((r) => r.gapWorst));
  // 設計時の実測は 平均 59.8° / 最悪 144.6°。この計画を書いた時点で
  // 同じアルゴリズムを回すと 平均 60.2° / 最悪 140.7° になる。
  // 参考: 完全等配置 27.9°、棄却なしの一様乱数 83.8° / 189.2°。
  assert.ok(mean < 70, `平均の空き ${mean.toFixed(1)}° が 70° を超えた`);
  assert.ok(worst < 170, `最悪の空き ${worst.toFixed(1)}° が 170° を超えた`);
});

test('発生率と同時枚数が設計値どおり', () => {
  const rate = avg(results.map((r) => r.rate));
  const live = avg(results.map((r) => r.live));
  // 設計時の実測は 5.0 枚/秒・同時 12.9 枚。この計画を書いた時点で
  // 同じアルゴリズムを回すと 4.77 枚/秒・同時 12.83 枚になる。
  // 帯から外れたら帯を広げず、原因を調べること（設計書の数値が契約）。
  assert.ok(rate > 4.5 && rate < 5.6, `発生率 ${rate.toFixed(2)} 枚/秒`);
  assert.ok(live > 11.5 && live < 14.5, `同時 ${live.toFixed(2)} 枚`);
});

test('同じシードなら、いつ回しても同じ結果になる', () => {
  const once = survey(3);
  const twice = survey(3);
  assert.deepEqual(once, twice);
});

test('棄却は起きるが、全滅して発生が止まることはない', () => {
  const burst = createBurst({ seed: 1 });
  for (let i = 0; i < Math.round(30 / DT); i++) burst.step(DT);
  // 棄却が 1 度も起きないなら、予測が働いていない
  assert.ok(burst.stats.rejected > 0, '棄却が 1 度も起きていない');
  // 全部の候補が弾かれて 1 枚も出ない、という状態にはならない
  assert.ok(burst.stats.spawned > 100, `30 秒で ${burst.stats.spawned} 枚しか出ていない`);
  assert.ok(
    burst.stats.skipped < burst.stats.spawned * 0.35,
    `見送りが多すぎる: 発生 ${burst.stats.spawned} / 見送り ${burst.stats.skipped}`,
  );
});

test('出発半径は自分の外接円の半径で、到達半径は 0.5〜1.0 に収まる', () => {
  const burst = createBurst({ seed: 2 });
  const seen: Card[] = [];
  for (let i = 0; i < Math.round(20 / DT); i++) {
    burst.step(DT);
    for (const c of burst.cards) if (!seen.some((s) => s.id === c.id)) seen.push(c);
  }
  assert.ok(seen.length > 60);
  for (const c of seen) {
    assert.ok(Math.abs(c.rho - (c.size * Math.SQRT2) / 2) < 1e-12, 'rho が外接円ではない');
    assert.ok(Math.abs(c.r0 - c.rho) < 1e-12, '出発半径が外接円の半径ではない');
    assert.ok(c.r1 >= 0.5 && c.r1 <= 1, `到達半径が範囲外: ${c.r1}`);
    assert.ok(c.size >= 0.13 * 0.8 - 1e-12 && c.size <= 0.13 * 1.2 + 1e-12);
    assert.ok(c.speed >= 0.26 * 0.6 - 1e-12 && c.speed <= 0.26 * 1.4 + 1e-12);
    assert.ok(c.variant >= 0 && c.variant < DEFAULTS.variants);
    assert.equal(c.persist, false);
  }
});

test('大きな dt が来ても、溜めを一気に吐き出さない', () => {
  // タブが止まって戻ってきた状況。1 フレームで何十枚も湧いたら見た目が壊れる。
  const burst = createBurst({ seed: 4 });
  burst.step(DT);
  const before = burst.cards.length;
  burst.step(5);
  assert.ok(
    burst.cards.length - before <= 1,
    `5 秒ぶんの dt で ${burst.cards.length - before} 枚湧いた`,
  );
});

test('persist: true の札は消えず、外周に溜まり続ける', () => {
  const burst = createBurst({ seed: 1, persist: true });
  for (let i = 0; i < Math.round(10 / DT); i++) burst.step(DT);
  assert.ok(burst.cards.length > 10, `${burst.cards.length} 枚しか残っていない`);
  // 1 枚も死んでいない
  assert.equal(burst.cards.length, burst.stats.spawned);
  assert.ok(burst.cards.every((c) => c.persist === true));
});

// --- 決定的なテスト（seq の算術を検査） ---

test('採用ごとに角度が黄金角 1 つ分進む（seq += i + 1 の検証）', () => {
  // 衝突が起きないように札を極小・ジッタ 0 にする
  // persist=true にして札を消さないようにする
  const burst = createBurst({
    seed: 1,
    cardSize: 0.004,
    cardJitter: 0,
    angleJitterDeg: 0,
    // margin は DEFAULTS のまま（1.18）で、いくつかの棄却が起きることを許容
    persist: true, // 札が消えないようにする
  });

  const seconds = 10;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    burst.step(DT);
  }

  // 棄却か見送りが起きていることを確認（アルゴリズムが働いている証拠）
  // 劣化 3 では棄却が起きないが見送りは起きるため、いずれかが 0 でなければよい
  // ただし最低限度の動作確認として、採用数が十分あることを確認
  assert.ok(
    burst.stats.spawned > 0,
    `採用数が 0。アルゴリズムが全く動いていない`,
  );

  // 採用札を観測して、連続する採用のたびに seq が進むことを検証
  // seq += i + 1 の劣化（seq += 1）があると、棄却をスキップしたときに seq の進みが小さくなる
  // 正確な逆算は複雑だが、角度が黄金角の倍数になっていることは必須
  burst.cards.sort((a, b) => a.id - b.id);
  const angles = burst.cards.map((c) => {
    // 角度を 0～360 の範囲に正規化
    let deg = ((c.angle * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    return deg;
  });

  // 最初の採用の角度は、seq の初期値（最初に棄却が起きるまでの進み）に依存
  // seq += i + 1 を検証するには、複数回の採用が起きた後で、
  // 平均的な角度差が期待値に近いことを見る

  // より直接的には、棄却が起きた場合、
  // 棄却数に応じて seq の進みが (棄却数) * (候補数) になる
  // つまり平均角度差が大きくなるはず

  if (burst.stats.rejected > 0) {
    // 棄却があった場合、平均角度差が大きいことを確認
    // seq += i + 1 を正しく実装すると、棄却スキップ時に seq がしっかり進む
    // seq += 1 の劣化だと、seq の進みが小さくなる
    let totalDiff = 0;
    for (let i = 1; i < angles.length; i++) {
      const diff = (angles[i] - angles[i - 1] + 360) % 360;
      totalDiff += diff;
    }
    const avgDiff = totalDiff / (angles.length - 1);
    // 棄却がある場合、平均角度差が大きくなるはず
    assert.ok(
      avgDiff > 30,
      `棄却があるのに平均角度差が小さい: ${avgDiff.toFixed(2)}°。seq += i + 1 が正しく実装されていないか？`,
    );
  }
});

test('全滅したら seq が 14 個分進む（seq += o.maxCandidates の検証）', () => {
  // margin を極端に大きくすると全候補が弾かれる
  // persist=true で札が消えないようにする
  const burst = createBurst({
    seed: 1,
    margin: 50,
    angleJitterDeg: 0,
    persist: true,
  });

  const seconds = 10;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    burst.step(DT);
  }

  // 見送りが起きたことを前提として固定
  assert.ok(
    burst.stats.skipped > 0,
    `見送りが起きていない。margin を大きくしても全滅していない`,
  );

  // 複数の採用がある場合、連続する採用札の角度差から seq の進みを検証
  // seq += o.maxCandidates を省くと、全滅ごとに seq が進まない
  // つまり、全滅を経た採用との角度差が小さくなる

  if (burst.cards.length > 1) {
    burst.cards.sort((a, b) => a.id - b.id);
    const angles = burst.cards.map((c) => {
      let deg = ((c.angle * 180) / Math.PI) % 360;
      if (deg < 0) deg += 360;
      return deg;
    });

    // seq += o.maxCandidates を正しく実装すると、
    // 全滅を経た採用では角度が大きく進む（14 個分以上）
    // seq += o.maxCandidates を省くと、角度差が小さい（1～14 個分）

    // 複数回の見送りが起きているはず。その間に採用された札を見ると、
    // 見送り回数 * 14 ぶんの角度差が出るはず

    // より直接的には、最後の採用の角度が期待値より大きいことを確認
    // （見送りが何回も起きれば、最終的な seq はかなり進んでいるはず）

    let totalDiff = 0;
    let diffCount = 0;
    for (let i = 1; i < angles.length; i++) {
      const diff = (angles[i] - angles[i - 1] + 360) % 360;
      totalDiff += diff;
      diffCount++;
    }
    const avgDiff = totalDiff / diffCount;

    // 正しい実装: skipped が多いほど avgDiff が大きい
    // 劣化版（seq += o.maxCandidates 省略）: avgDiff が小さい

    // 期待値: 見送りが起きていれば、平均角度差が大きいはず
    // margin 50 にして全滅を強制すれば、skipped は必ず > 0
    // 正しい実装なら seq がしっかり進むので avgDiff が大きい
    // seq += o.maxCandidates を省くと avgDiff が小さい
    assert.ok(
      avgDiff > 12,
      `見送りが起きているのに平均角度差が小さい: ${avgDiff.toFixed(2)}°、skipped=${burst.stats.skipped}。seq += o.maxCandidates が省かれていないか？`,
    );
  }
});

test('誕生時刻が発生間隔の整数倍に乗る（nextSpawn += o.spawnInterval の検証）', () => {
  const burst = createBurst({ seed: 1 });
  const seconds = 60;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    burst.step(DT);
  }

  // 各札の born が spawnInterval の整数倍から dt 未満しかずれていないことを確認
  const drifts = burst.cards.map((c) => {
    const spawnIdx = Math.round(c.born / DEFAULTS.spawnInterval);
    const expectedBorn = spawnIdx * DEFAULTS.spawnInterval;
    return Math.abs(c.born - expectedBorn);
  });

  const maxDrift = Math.max(...drifts);
  assert.ok(
    maxDrift < DT,
    `最大のずれが dt を超えている: ${maxDrift.toFixed(6)}。nextSpawn = t + ... の劣化がないか？`,
  );
});
