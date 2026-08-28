import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { Physics2DPlugin } from 'gsap/Physics2DPlugin';
import { SplitText } from 'gsap/SplitText';
import { CustomEase } from 'gsap/CustomEase';
import { CustomWiggle } from 'gsap/CustomWiggle';

// 実際には、GSAPの全初期化をここで行います。
// 複雑なコードを一つずつ読み込ませるのではなく、コアなものを見えやすい場所で統合。
//
// gsap 3.15 では旧 Club GreenSock のプラグインが全て同梱されている
// （2025 年の Webflow 買収に伴い全面無料化）。追加インストールは不要。
//
// registerPlugin は DOM を要求するのでブラウザ側でのみ実行する。
if (typeof window !== 'undefined') {
  gsap.registerPlugin(
    ScrollTrigger,
    Draggable,
    InertiaPlugin,
    DrawSVGPlugin,
    MotionPathPlugin,
    MorphSVGPlugin,
    Physics2DPlugin,
    SplitText,
    CustomEase,
    CustomWiggle,
  );

  // 計器の起動に使う、溜めてから一気に据わるイーズ。
  CustomEase.create('instrument', 'M0,0 C0.16,0 0.2,0.34 0.32,0.62 0.44,0.9 0.6,1 1,1');
  // 選択時に文字が一瞬ぶれてから収まる挙動。
  CustomWiggle.create('settle', { wiggles: 4, type: 'easeOut' });

  // アニメーション主体のプロジェクトなので、開発時はコンソールから
  // タイムラインや ScrollTrigger を触れるようにしておく。本番には出さない。
  if (process.env.NODE_ENV !== 'production') {
    Object.assign(window as unknown as Record<string, unknown>, {
      gsap,
      ScrollTrigger,
    });
  }
}

export {
  gsap,
  ScrollTrigger,
  Draggable,
  DrawSVGPlugin,
  MotionPathPlugin,
  MorphSVGPlugin,
  Physics2DPlugin,
  SplitText,
};

export default gsap;
