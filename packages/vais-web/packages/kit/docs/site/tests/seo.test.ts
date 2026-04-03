import { describe, it, expect } from "vitest";
import { generateMetaTags } from "../src/seo";

describe("generateMetaTags", () => {
  it("기본 메타 태그를 생성한다", () => {
    const result = generateMetaTags();

    expect(result).toContain('<meta name="description"');
    expect(result).toContain('<meta property="og:title"');
    expect(result).toContain('<meta property="og:description"');
    expect(result).toContain('<meta property="og:image"');
    expect(result).toContain('<meta property="og:url"');
    expect(result).toContain('<meta property="og:type" content="website">');
    expect(result).toContain('<meta name="twitter:card"');
    expect(result).toContain('<meta name="twitter:title"');
    expect(result).toContain('<meta name="twitter:description"');
    expect(result).toContain('<meta name="twitter:image"');
  });

  it("기본값으로 VaisX 프레임워크 정보를 사용한다", () => {
    const result = generateMetaTags();

    expect(result).toContain("VaisX");
    expect(result).toContain("vaisx.dev");
    expect(result).toContain('content="summary_large_image"');
  });

  it("커스텀 타이틀을 반영한다", () => {
    const result = generateMetaTags({ title: "라우팅 가이드 | VaisX" });

    expect(result).toContain('content="라우팅 가이드 | VaisX"');
    // 미제공 항목은 기본값 유지
    expect(result).toContain("vaisx.dev");
  });

  it("커스텀 설명을 반영한다", () => {
    const result = generateMetaTags({ description: "VaisX 라우팅 심층 가이드" });

    expect(result).toContain('content="VaisX 라우팅 심층 가이드"');
  });

  it("OpenGraph 태그를 포함한다", () => {
    const result = generateMetaTags({
      title: "컴포넌트 API",
      description: "VaisX 컴포넌트 API 레퍼런스",
      ogImage: "https://vaisx.dev/og/components.png",
      ogUrl: "https://vaisx.dev/docs/components",
    });

    expect(result).toContain(
      '<meta property="og:title" content="컴포넌트 API">'
    );
    expect(result).toContain(
      '<meta property="og:description" content="VaisX 컴포넌트 API 레퍼런스">'
    );
    expect(result).toContain(
      '<meta property="og:image" content="https://vaisx.dev/og/components.png">'
    );
    expect(result).toContain(
      '<meta property="og:url" content="https://vaisx.dev/docs/components">'
    );
  });

  it("twitter:card 값을 변경할 수 있다", () => {
    const result = generateMetaTags({ twitterCard: "summary" });

    expect(result).toContain('<meta name="twitter:card" content="summary">');
  });

  it("반환값은 줄바꿈으로 구분된 단일 문자열이다", () => {
    const result = generateMetaTags();
    const lines = result.split("\n");

    // og:type 포함 10개 태그
    expect(lines).toHaveLength(10);
    lines.forEach((line) => {
      expect(line.trim()).toMatch(/^<meta /);
    });
  });
});
