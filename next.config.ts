import type { NextConfig } from 'next'

/**
 * GitHub Pages はプロジェクトサイトを /<repo>/ の下に配信する。
 * そのぶんのサブパスは CI からだけ渡す。ローカルの dev / build はルートのまま動く。
 */
const basePath = process.env.PAGES_BASE_PATH ?? ''

const nextConfig: NextConfig = {
  // サーバー機能を使っていないので、全ページを静的 HTML として out/ に書き出す。
  output: 'export',
  basePath,
  // Pages は /armillary を /armillary/ へリダイレクトする。末尾スラッシュに揃えておく。
  trailingSlash: true,
}

export default nextConfig
