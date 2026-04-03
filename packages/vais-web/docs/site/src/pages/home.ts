export function renderHomePage(): string {
  return `
<section class="hero">
  <p class="hero__eyebrow">VaisX Framework</p>
  <h1 class="hero__title">
    Build fast UIs with<br /><span>minimal overhead</span>
  </h1>
  <p class="hero__subtitle">
    VaisX is a token-efficient frontend framework designed for modern
    web development — runtime under 3&nbsp;KB gzipped.
  </p>
  <div class="hero__actions">
    <a href="/guide/" class="btn btn-primary">Get Started →</a>
    <a href="/api/" class="btn btn-secondary">API Reference</a>
  </div>
</section>

<section class="features" aria-label="Key features">
  <div class="feature-card">
    <div class="feature-card__icon" aria-hidden="true">⚡</div>
    <h3 class="feature-card__title">Tiny Runtime</h3>
    <p class="feature-card__desc">
      The <code>@vaisx/runtime</code> core weighs less than 3&nbsp;KB gzipped.
      No virtual DOM — direct, predictable updates.
    </p>
  </div>
  <div class="feature-card">
    <div class="feature-card__icon" aria-hidden="true">🔀</div>
    <h3 class="feature-card__title">Built-in Router &amp; SSR</h3>
    <p class="feature-card__desc">
      <code>@vaisx/kit</code> ships with a file-based router and full
      server-side rendering &amp; static generation support out of the box.
    </p>
  </div>
  <div class="feature-card">
    <div class="feature-card__icon" aria-hidden="true">🛠️</div>
    <h3 class="feature-card__title">First-class TypeScript</h3>
    <p class="feature-card__desc">
      Every package is written in TypeScript and ships with complete
      type definitions — no extra <code>@types</code> packages needed.
    </p>
  </div>
  <div class="feature-card">
    <div class="feature-card__icon" aria-hidden="true">🧩</div>
    <h3 class="feature-card__title">Composable Components</h3>
    <p class="feature-card__desc">
      <code>@vaisx/components</code> provides a tree-shakeable
      primitives library that integrates seamlessly with any VaisX project.
    </p>
  </div>
  <div class="feature-card">
    <div class="feature-card__icon" aria-hidden="true">🚀</div>
    <h3 class="feature-card__title">Vite-Powered CLI</h3>
    <p class="feature-card__desc">
      Scaffold, develop, and deploy with a single <code>@vaisx/cli</code>
      command. Hot module replacement is included by default.
    </p>
  </div>
  <div class="feature-card">
    <div class="feature-card__icon" aria-hidden="true">🔬</div>
    <h3 class="feature-card__title">Vitest Integration</h3>
    <p class="feature-card__desc">
      Unit and integration testing is a first-class citizen — every
      package ships with a Vitest configuration ready to go.
    </p>
  </div>
</section>
`.trim();
}
