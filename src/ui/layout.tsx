import type { Child } from "hono/jsx";

import { product } from "../config/product";

type LayoutProps = {
  canonical?: string;
  children: Child;
  description?: string;
  noindex?: boolean;
  title?: string;
};

export function Layout({
  canonical = product.url,
  children,
  description = product.description,
  noindex = false,
  title = product.name,
}: LayoutProps) {
  return (
    <html itemscope itemtype="https://schema.org/WebApplication" lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <meta content={description} name="description" />
        {noindex ? <meta content="noindex,nofollow,noarchive" name="robots" /> : null}
        <meta content={product.name} itemProp="name" />
        <meta content={description} itemProp="description" />
        <meta content={product.url} itemProp="url" />
        <meta content={product.applicationCategory} itemProp="applicationCategory" />
        <meta content="Any" itemProp="operatingSystem" />
        <meta content="true" itemProp="isAccessibleForFree" />
        <meta content={description} property="og:description" />
        <meta content={product.ogImage} property="og:image" />
        <meta content={product.ogImageAlt} property="og:image:alt" />
        <meta content="720" property="og:image:height" />
        <meta content="1280" property="og:image:width" />
        <meta content="ja_JP" property="og:locale" />
        <meta content={title} property="og:title" />
        <meta content="website" property="og:type" />
        <meta content={canonical} property="og:url" />
        <meta content="summary_large_image" name="twitter:card" />
        <meta content={product.ogImage} name="twitter:image" />
        <link href={canonical} rel="canonical" />
        <link href="/styles.css" rel="stylesheet" />
        <title>{title}</title>
      </head>
      <body>
        <a class="skip-link" href="#main">
          本文へ移動
        </a>
        <header class="site-header">
          <a class="brand" href="/">
            <span aria-hidden="true" class="brand-mark">
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </span>
            {product.name}
          </a>
          <nav aria-label="メイン">
            <a class="nav-cta" href="/#create">
              日程をつくる
            </a>
            <a href="/privacy">プライバシー</a>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer>
          <span>© 2026 {product.name}</span>
          <nav aria-label="フッター">
            <a href="/privacy">プライバシー</a>
            <a href="https://github.com/yhay81/date-quilt">GitHub</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
