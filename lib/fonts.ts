import { Archivo, Instrument_Serif, Martian_Mono } from 'next/font/google';

/**
 * 本文と見出しのグロテスク体。
 * 既存デザインの「幾何学的で芯のある」語彙に合わせて Archivo を採用。
 */
export const sans = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
});

/**
 * イタリックのアクセント専用。
 * 計器盤に "Instrument" Serif という洒落も込みで続投。
 */
export const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-instrument',
});

/**
 * 目盛り・座標・読み取り値の等幅。
 * 幅広で機械的な字面が計器の語彙に合う。
 */
export const mono = Martian_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  display: 'swap',
  variable: '--font-martian',
});
