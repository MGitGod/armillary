/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    // Tailwind v4 は Lightning CSS でベンダープレフィックスを内製処理するため
    // autoprefixer は不要（併用すると二重処理になる）。
    "@tailwindcss/postcss": {},
  },
}
