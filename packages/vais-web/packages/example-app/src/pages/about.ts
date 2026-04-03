/**
 * About page — static informational page about the VaisX Blog.
 */

import type { RouteContext } from "../types.js";
import { escapeHtml } from "../ssr/render.js";
import type { PageComponent } from "../ssr/render.js";
import { Header } from "../components/header.js";

// ── About Page Labels ─────────────────────────────────────────────────────────

const aboutLabels: Record<string, Record<string, string>> = {
  en: {
    title: "About VaisX Blog",
    heading: "About Us",
    intro:
      "VaisX Blog is the official publication for the VaisX framework community. We share insights on modern web development, compiler design, and developer tooling.",
    missionTitle: "Our Mission",
    mission:
      "We believe that great developer experience is foundational to great software. VaisX is built on this principle — it should be fast to learn, fast to build with, and fast to run.",
    teamTitle: "The Team",
    teamDescription: "VaisX Blog is written by the core team and community contributors.",
    contactTitle: "Contact",
    contactDescription: "Have a story to share? Reach out to us on GitHub.",
  },
  ko: {
    title: "VaisX 블로그 소개",
    heading: "소개",
    intro:
      "VaisX 블로그는 VaisX 프레임워크 커뮤니티의 공식 출판물입니다. 현대 웹 개발, 컴파일러 설계, 개발자 도구에 대한 인사이트를 공유합니다.",
    missionTitle: "미션",
    mission:
      "우리는 뛰어난 개발자 경험이 훌륭한 소프트웨어의 기반이라고 믿습니다. VaisX는 이 원칙 위에 구축되었습니다 — 빠르게 배우고, 빠르게 구축하고, 빠르게 실행됩니다.",
    teamTitle: "팀",
    teamDescription: "VaisX 블로그는 코어 팀과 커뮤니티 기여자들이 작성합니다.",
    contactTitle: "연락처",
    contactDescription: "공유하고 싶은 이야기가 있으신가요? GitHub에서 연락주세요.",
  },
  ja: {
    title: "VaisX ブログについて",
    heading: "私たちについて",
    intro:
      "VaisX ブログは、VaisXフレームワークコミュニティの公式出版物です。現代のWeb開発、コンパイラ設計、開発者ツールに関するインサイトを共有します。",
    missionTitle: "ミッション",
    mission:
      "私たちは、優れた開発者体験が優れたソフトウェアの基盤であると信じています。VaisXはこの原則に基づいて構築されています — 速く学び、速く構築し、速く実行します。",
    teamTitle: "チーム",
    teamDescription: "VaisX ブログはコアチームとコミュニティの貢献者によって書かれています。",
    contactTitle: "お問い合わせ",
    contactDescription: "共有したいストーリーがありますか？GitHubでご連絡ください。",
  },
};

// ── About Page Component ──────────────────────────────────────────────────────

export const AboutPage: PageComponent = (context: RouteContext) => {
  const { locale } = context;
  const l = aboutLabels[locale] ?? aboutLabels["en"]!;

  const header = Header({ currentPath: "/about", locale });

  const body = `${header}
<main class="about-page" id="main-content">
  <div class="container">
    <article class="about-article">
      <header class="about-header">
        <h1 class="page-heading">${escapeHtml(l["heading"]!)}</h1>
        <p class="about-intro">${escapeHtml(l["intro"]!)}</p>
      </header>
      <section class="about-section" aria-labelledby="mission-heading">
        <h2 id="mission-heading">${escapeHtml(l["missionTitle"]!)}</h2>
        <p>${escapeHtml(l["mission"]!)}</p>
      </section>
      <section class="about-section" aria-labelledby="team-heading">
        <h2 id="team-heading">${escapeHtml(l["teamTitle"]!)}</h2>
        <p>${escapeHtml(l["teamDescription"]!)}</p>
        <ul class="team-list">
          <li class="team-member">
            <img src="/avatars/alice.png" alt="Alice Kim" width="64" height="64" class="team-avatar" loading="lazy">
            <div>
              <strong>Alice Kim</strong>
              <p>Core Framework Engineer</p>
            </div>
          </li>
          <li class="team-member">
            <img src="/avatars/bob.png" alt="Bob Park" width="64" height="64" class="team-avatar" loading="lazy">
            <div>
              <strong>Bob Park</strong>
              <p>Compiler &amp; Tooling</p>
            </div>
          </li>
          <li class="team-member">
            <img src="/avatars/carol.png" alt="Carol Lee" width="64" height="64" class="team-avatar" loading="lazy">
            <div>
              <strong>Carol Lee</strong>
              <p>Developer Experience</p>
            </div>
          </li>
        </ul>
      </section>
      <section class="about-section" aria-labelledby="contact-heading">
        <h2 id="contact-heading">${escapeHtml(l["contactTitle"]!)}</h2>
        <p>${escapeHtml(l["contactDescription"]!)}
          <a href="https://github.com/vaislang/vais-web" class="external-link" rel="noopener noreferrer" target="_blank">GitHub</a>.
        </p>
      </section>
    </article>
  </div>
</main>`;

  return {
    title: l["title"]!,
    body,
    meta: `<meta name="description" content="${escapeHtml(l["intro"]!.slice(0, 160))}">`,
  };
};
