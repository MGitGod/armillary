import type { Experiment } from '../../lib/lab';
import { orrery } from './experiments/orrery';
import { typeGravity } from './experiments/type-gravity';
import { rhodonea } from './experiments/rhodonea';
import { lissajous } from './experiments/lissajous';
import { morph } from './experiments/morph';
import { shutter } from './experiments/shutter';
import { curtain } from './experiments/curtain';
import { maskedLines } from './experiments/masked-lines';
import { paperSphere } from './experiments/paper-sphere';
import { radialBurst } from './experiments/radial-burst';
import { stellarParallax } from './experiments/stellar-parallax';
import { depthStack } from './experiments/depth-stack';
import { offAxisWindow } from './experiments/off-axis-window';

/**
 * ラボの棚。並び順がそのまま見せる順番になる。
 *
 * 実験を足すときは experiments/ にファイルを 1 つ作って、ここに 1 行足すだけ。
 * 番号・見出し・技法タグ・ピンの張り方・端の遷移は LabSection が面倒を見る。
 */
export const experiments: Experiment[] = [
  orrery,
  typeGravity,
  rhodonea,
  lissajous,
  morph,
  shutter,
  curtain,
  maskedLines,
  paperSphere,
  radialBurst,
  stellarParallax,
  depthStack,
  offAxisWindow,
];
