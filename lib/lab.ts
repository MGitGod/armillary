import type React from 'react';
import type { gsap } from 'gsap';

/**
 * @file lab.ts
 * @description ラボに実験を並べるための最小の約束事。
 *
 * 実験 1 個 = ファイル 1 つ + registry.ts に 1 行。
 * 実験は「自分がどう再生されるか」を知らなくてよい。
 * タイムラインを組むだけで、再生位置はスクロール側が握る。
 */

export type Experiment = {
  /** URL やアンカーに使う識別子。 */
  id: string;
  title: string;
  /** 使っている技法。画面に技法タグとして出る。 */
  tech: string[];
  /** 何を試したのかの一言。 */
  note: string;

  /**
   * ピン留めする区間の長さ（ビューポート高の倍数）。
   * 長い演出ほど大きく。既定 1.5。
   */
  length?: number;

  /**
   * false にするとピン留めしない。
   * 自律的に動く対話型（Orrery など）向け。
   */
  pin?: boolean;

  /**
   * 区間の端で内容をフェードさせるか。既定 true。
   * 終端の絵を保持したい実験は false にする。
   */
  fade?: boolean;

  // --- 中身は次のどちらか ---

  /** 静的な DOM。ほとんどの実験はこちら。 */
  render?: () => React.ReactNode;
  /**
   * スクロールで scrub されるタイムラインを組む。
   * root は render() が返した DOM を包む要素。
   * 後片付けが要る場合（SplitText の revert など）は関数を返す。
   */
  build?: (tl: gsap.core.Timeline, root: HTMLElement) => void | (() => void);

  /**
   * 自分で状態と再生を持つ対話型。scrub されない。
   * render/build の代わりに使う。
   */
  Component?: React.ComponentType;
};
