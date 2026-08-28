/**
 * @file radial-burst.ts
 * @description 中心から放射して消えていく札の、幾何と発生の規則。
 *              純粋関数と 1 つの状態機械だけ（DOM も GSAP も持たない）。
 *
 * 長さは全て「盤の半径 R」に対する比で持つ。このモジュールは画面サイズを
 * 一切知らないので、リサイズは描画側の掛け算だけで済み、ここは測り直さなくてよい。
 */

/**
 * 黄金角(deg)。Orrery の初期位相、Paper Sphere のフィボナッチ球に続いて三度目。
 * 欲しいのは「滑らかに揺れる」ノイズではなく「均等にばらける」ほうなので、
 * パーリンノイズではなくこちらを使う。
 */
export const GOLDEN_ANGLE_DEG = 137.50776405003785;

/** フェードの境目（行程に対する比）。 */
export const FADE_IN_END = 0.16;
export const FADE_OUT_START = 0.55;

/**
 * 確定値。設計書 2026-08-28-radial-burst-design.md の「確定値」節と 1 対 1。
 * 特に margin は 1.12 だと 5 シード中 1 つで重なりが出た。下げないこと。
 */
export const DEFAULTS = {
  /** 平均速度(R/s)。 */
  speed: 0.26,
  /** 速度のばらつき（±この比）。 */
  speedJitter: 0.4,
  /** 発生間隔(s)。 */
  spawnInterval: 0.18,
  /** 札の一辺(R比)。 */
  cardSize: 0.13,
  /** 一辺のばらつき（±この比）。 */
  cardJitter: 0.2,
  /** 到達半径の下限・上限(R比)。上限 1.0 ＝ 札の中心が外周に達する。 */
  reachMin: 0.5,
  reachMax: 1,
  /** 予測側の判定円を実際より大きく取る倍率。 */
  margin: 1.18,
  /** 候補角に足すジッタ（±この deg）。 */
  angleJitterDeg: 8.6,
  /** 1 回の発生で試す候補の数。 */
  maxCandidates: 14,
  /** 図版の種類数。描画側が解釈する。 */
  variants: 6,
  /** true にすると札が消えない（作品版）。 */
  persist: false,
};

export type Card = {
  id: number;
  /** 進行方向(rad)。 */
  angle: number;
  /**
   * 出発半径(R比)＝自分の外接円の半径。
   * 中心付近には原理的に 1 枚しか置けない（半径 r で角度差 Δθ の 2 枚の距離は r·Δθ
   * なので、必要な角度差が r→0 で無限に開く）。だから見えない「産まれる輪」から出す。
   */
  r0: number;
  /** 到達半径(R比)。札の「中心」がここに達したら行程が尽きる。 */
  r1: number;
  /** 一辺(R比)。 */
  size: number;
  /**
   * 外接円の半径(R比)＝ size × √2 ÷ 2。当たり判定はこれだけで持つ。
   * 向きごとに判定の形を変えると、orientation を切り替えるたびに重なり保証が壊れる。
   * 実際の矩形より少し大きいぶんの空気は、その代償として安い。
   */
  rho: number;
  /** 平均速度(R/s)。イージング前の値。 */
  speed: number;
  /** 誕生時刻(s)。 */
  born: number;
  /** 行程にかかる時間(s)＝(r1 − r0)/speed。 */
  life: number;
  /** 図版の種類。描画側が解釈する。 */
  variant: number;
  /** true なら行程の終わりで消えず、その場に留まる。 */
  persist: boolean;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * mulberry32。テストで同じ列を再現するために自前で持つ。
 * Math.random では「5 シード × 120 秒」の回帰テストが書けない。
 */
export const makeRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * 減速(ease-out)。u∈[0,1] を行程 0..1 に写す。
 * 0 近傍の傾きが 2 ── 瞬間速度は平均の最大 2 倍になる。
 * 衝突予測の刻み数はこの 2 を使って逆算する。
 */
export const easeOut = (u: number) => u * (2 - u);

/** 行程。0 で誕生、1 で行程の終わり。範囲外にも素直に伸びる（生死の判定に使う）。 */
export const progressAt = (c: Card, t: number) =>
  c.life <= 0 ? 1 : (t - c.born) / c.life;

/** 中心からの距離(R比)。 */
export const radiusAt = (c: Card, t: number) =>
  c.r0 + (c.r1 - c.r0) * easeOut(clamp01(progressAt(c, t)));

/** 中心を原点とした座標(R比)。 */
export const positionAt = (c: Card, t: number) => {
  const r = radiusAt(c, t);
  return { x: Math.cos(c.angle) * r, y: Math.sin(c.angle) * r };
};

/**
 * 不透明度。0→16% で現れ、55%→100% で消える。
 * persist の札はフェードインしたあと 1 のまま留まる。
 */
export const opacityAt = (c: Card, t: number) => {
  const u = progressAt(c, t);
  if (u <= 0) return 0;
  if (u < FADE_IN_END) return u / FADE_IN_END;
  if (c.persist) return 1;
  if (u >= 1) return 0;
  if (u > FADE_OUT_START) return (1 - u) / (1 - FADE_OUT_START);
  return 1;
};

/**
 * 生きている札の角度に空いた、最大の隙間(deg)。
 *
 * 要件「出現角度に偏りを持たせない」の本質は長期のヒストグラムではなく、
 * **その瞬間、片側がガラ空きに見えないか**。測る量をこれに変えて方式を選んだ。
 * 参考値: 完全等配置 27.9°、棄却なしの一様乱数 83.8°。
 */
export const maxAngularGap = (cards: Card[]): number => {
  if (cards.length < 2) return 360;
  const degs = cards
    .map((c) => ((((c.angle * 180) / Math.PI) % 360) + 360) % 360)
    .sort((a, b) => a - b);

  // 折り返しをまたぐ隙間から始める
  let gap = degs[0] + 360 - degs[degs.length - 1];
  for (let i = 1; i < degs.length; i++) {
    const d = degs[i] - degs[i - 1];
    if (d > gap) gap = d;
  }
  return gap;
};

/**
 * 将来の重なりを予測する刻み数。
 *
 * **固定数にしてはいけない。** 速度をばらすと、速い札が遅い札を
 * サンプルとサンプルの間で通り抜ける（14 点固定・最も密な条件で、
 * 90 秒あたり 30 回の重なり、最大めり込み 7.7%）。
 * 1 ステップの相対移動量が判定距離の 40% を超えないところまで刻む。
 *
 * vRel の 2 は ease-out の瞬間速度が平均の最大 2 倍になることから来ている。
 */
export const predictSteps = (a: Card, b: Card, horizon: number, margin: number) => {
  const vRel = 2 * (a.speed + b.speed);
  const lim = (a.rho + b.rho) * margin;
  const n = Math.ceil((horizon * vRel) / (0.4 * lim));
  return n < 8 ? 8 : n > 600 ? 600 : n;
};

/**
 * a と b が、これから horizon 秒のあいだに判定距離まで近づくか。
 *
 * 判定は外接円だけで行う。札の向き(orientation)を切り替えても
 * 当たり判定の形が変わらない ── 向きごとに形を変えると、切り替えるたびに
 * 重なり保証が壊れる。
 *
 * margin は「予測側の判定円を実際より大きく取る」ための倍率。
 * 距離がしきい値をわずかに下回ってすぐ戻る「かすり」は、1 ステップ内の
 * 距離変化量そのものが小さいので、どれだけ刻んでも網に掛からない。
 * 刻みでは漸近的にしか消えず、正しい直し方はこちら。
 */
export const willCollide = (
  a: Card,
  b: Card,
  t: number,
  horizon: number,
  margin: number,
) => {
  if (horizon <= 0) return false;
  const lim = (a.rho + b.rho) * margin;
  const steps = predictSteps(a, b, horizon, margin);

  for (let i = 0; i <= steps; i++) {
    const tt = t + (horizon * i) / steps;
    const pa = positionAt(a, tt);
    const pb = positionAt(b, tt);
    if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < lim) return true;
  }
  return false;
};

export type BurstOptions = {
  /** 省略すると 1。テストで列を再現するために使う。 */
  seed?: number;
  speed?: number;
  speedJitter?: number;
  spawnInterval?: number;
  cardSize?: number;
  cardJitter?: number;
  reachMin?: number;
  reachMax?: number;
  margin?: number;
  angleJitterDeg?: number;
  maxCandidates?: number;
  variants?: number;
  /**
   * true にすると札が消えない（作品版）。
   * 札が溜まり続けるので「時間とともに空く」前提が崩れる。
   * **重なり保証は未検証。** 作品版を作るときに別途設計が要る。
   */
  persist?: boolean;
};

export type Emitter = {
  /** 生きている札。step() が破壊的に更新する、同じ配列。 */
  cards: Card[];
  /** 経過時刻(s)。 */
  time: number;
  stats: { spawned: number; rejected: number; skipped: number };
  /** dt 秒進める。呼び出し側で dt を丸めておくこと（タブ復帰の巨大な delta 対策）。 */
  step(dt: number): void;
};

/**
 * 札を産み続けるエミッタ。
 *
 * 角度は黄金角 137.5° の通し番号で出す。将来重なるなら棄却して次の候補へ進むが、
 * **棄却しても通し番号は進める** ── 次の候補は黄金角ぶん先なので、棄却が分布を歪めない。
 *
 * 「いま最大の隙間の真ん中を狙う」方式も測ったが、平均で 7% しか良くならず
 * 最悪値ではむしろ負けた（最大の隙間を埋めに行くと 2 番目が放置される）。
 * 状態を持たない黄金角のほうが単純で、既存コードとも同じ語彙。
 */
export const createBurst = (opts: BurstOptions = {}): Emitter => {
  const o = { ...DEFAULTS, ...opts };
  const rand = makeRandom(opts.seed ?? 1);

  const cards: Card[] = [];
  const stats = { spawned: 0, rejected: 0, skipped: 0 };

  /** 黄金角の通し番号。棄却しても進める。 */
  let seq = 0;
  let nextId = 0;
  let nextSpawn = 0;

  /** 行程が終わる時刻。persist でも「動きが止まる」時刻としては同じ。 */
  const travelEnd = (c: Card) => c.born + c.life;

  const emitter: Emitter = {
    cards,
    time: 0,
    stats,
    step(dt: number) {
      emitter.time += dt;
      const t = emitter.time;

      // 死ぬ札を先に外す。空いた場所を同じフレームの新入りが使えるようにする。
      for (let i = cards.length - 1; i >= 0; i--) {
        if (!cards[i].persist && progressAt(cards[i], t) >= 1) cards.splice(i, 1);
      }

      if (t < nextSpawn) return;

      // --- 候補を 1 枚こしらえる ---
      // 角度以外は候補ごとに引き直さない。棄却の理由を角度だけに絞るため。
      const size = o.cardSize * (1 + (rand() * 2 - 1) * o.cardJitter);
      const rho = (size * Math.SQRT2) / 2;
      const r1 = o.reachMin + rand() * (o.reachMax - o.reachMin);
      const speed = o.speed * (1 + (rand() * 2 - 1) * o.speedJitter);
      const variant = Math.floor(rand() * o.variants);
      const life = Math.max(0, r1 - rho) / speed;

      let placed: Card | null = null;

      for (let i = 0; i < o.maxCandidates; i++) {
        const deg = (seq + i) * GOLDEN_ANGLE_DEG + (rand() * 2 - 1) * o.angleJitterDeg;
        const cand: Card = {
          id: nextId,
          angle: (deg * Math.PI) / 180,
          r0: rho,
          r1,
          size,
          rho,
          speed,
          born: t,
          life,
          variant,
          persist: o.persist,
        };

        let hit = false;
        for (const other of cards) {
          // どちらかが消えたら、もう重なりようがない。
          // persist なら消えないので、両方が止まるまで見る（止まれば位置は変わらない）。
          const end = o.persist
            ? Math.max(travelEnd(cand), travelEnd(other))
            : Math.min(travelEnd(cand), travelEnd(other));
          if (willCollide(cand, other, t, end - t, o.margin)) {
            hit = true;
            break;
          }
        }

        if (!hit) {
          seq += i + 1; // 採用した候補の次から続ける
          placed = cand;
          break;
        }
        stats.rejected++;
      }

      if (placed) {
        cards.push(placed);
        nextId++;
        stats.spawned++;
      } else {
        seq += o.maxCandidates;
        stats.skipped++;
      }

      nextSpawn += o.spawnInterval;
      // タブが止まっていた等で大きく遅れたら、溜めを吐き出さずに現在へ合わせる。
      // 1 フレームで何十枚も湧くと見た目が壊れる。
      if (nextSpawn < t) nextSpawn = t + o.spawnInterval;
    },
  };

  return emitter;
};
