export interface SeoOptions {
  title?: string;
  description?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
}

const DEFAULTS: Required<SeoOptions> = {
  title: "VaisX — 공식 문서",
  description:
    "VaisX 프레임워크 공식 문서. 라우팅, 렌더링 전략, 컴파일러 옵션 등 모든 기능을 안내합니다.",
  ogImage: "https://vaisx.dev/og-image.png",
  ogUrl: "https://vaisx.dev",
  twitterCard: "summary_large_image",
};

/**
 * SEO 메타 태그 HTML 문자열을 생성합니다.
 *
 * @param options - 페이지별 SEO 옵션. 미제공 항목은 기본값으로 채워집니다.
 * @returns `<meta>` 태그들이 개행 문자로 연결된 HTML 문자열.
 */
export function generateMetaTags(options: SeoOptions = {}): string {
  const resolved: Required<SeoOptions> = {
    title: options.title ?? DEFAULTS.title,
    description: options.description ?? DEFAULTS.description,
    ogImage: options.ogImage ?? DEFAULTS.ogImage,
    ogUrl: options.ogUrl ?? DEFAULTS.ogUrl,
    twitterCard: options.twitterCard ?? DEFAULTS.twitterCard,
  };

  const tags: string[] = [
    `<meta name="description" content="${resolved.description}">`,
    `<meta property="og:title" content="${resolved.title}">`,
    `<meta property="og:description" content="${resolved.description}">`,
    `<meta property="og:image" content="${resolved.ogImage}">`,
    `<meta property="og:url" content="${resolved.ogUrl}">`,
    `<meta property="og:type" content="website">`,
    `<meta name="twitter:card" content="${resolved.twitterCard}">`,
    `<meta name="twitter:title" content="${resolved.title}">`,
    `<meta name="twitter:description" content="${resolved.description}">`,
    `<meta name="twitter:image" content="${resolved.ogImage}">`,
  ];

  return tags.join("\n");
}
