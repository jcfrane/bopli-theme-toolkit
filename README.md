# Bopli theme toolkit

This repository owns the public, versioned boundary between Bopli and independently deployed themes.

Licensed under the MIT License.

- `@bopli/theme-sdk` contains public prop types plus injected navigation and content-query helpers.
- `@bopli/theme-cli` validates, builds, packages, and serves convention-based Vue themes without access to Bopli application source.
- `starter-theme/` is the minimal source scaffold.

## Commands

Theme repositories install the public packages:

```sh
npm install --save-dev --save-exact @bopli/theme-cli@0.5.2 @bopli/theme-sdk@0.4.0
npx bopli-theme validate .
npx bopli-theme build .
npx bopli-theme package .
npx bopli-theme dev . --app ../bopli-app
```

Toolkit contributors can run the CLI directly against sibling repositories:

```sh
npm install
npm run build
npm test
npm run check
node packages/cli/bin/bopli-theme.js validate ../dev-cosmo
node packages/cli/bin/bopli-theme.js build ../dev-cosmo
node packages/cli/bin/bopli-theme.js package ../dev-cosmo
node packages/cli/bin/bopli-theme.js dev ../dev-cosmo --app ../bopli-app
```

The SDK and CLI are strict TypeScript projects compiled to their package-local `dist/` directories. The CLI entry point only parses and dispatches commands; theme inspection, source-boundary validation, descriptor generation, build orchestration, deterministic release packaging, the development server, and starter-recipe validation live in focused modules under `packages/cli/src/`. The published executable remains a minimal JavaScript shebang wrapper because Node package bins must be directly executable, and it loads the compiled TypeScript output.

Theme source is TypeScript too: normal modules use `.ts`, Vue components use `<script setup lang="ts">`, and each theme runs `vue-tsc` before a production build. `starter-theme/` is the canonical checked scaffold.

Production browser builds preserve the runtime entry exports while emitting imported fonts, images, and other static assets as separate inventoried files. This keeps the render-blocking stylesheet small and lets each immutable asset use the CDN cache independently. Server builds remain self-contained for verified in-memory execution.

Theme identity, compatibility, chooser metadata, and optional presentation settings live in the normal `package.json` under `bopli`. Composer metadata is not used. The five setting types are `text`, `boolean`, `select`, `color`, and `image`; Bopli merges declared defaults with per-Site overrides and supplies the resulting `settings` prop to every template.

`build` writes immutable ESM, CSS, assets, and protocol-v1 `theme.json` to the theme's `dist/` directory. It also writes the computed release hash to the ignored `.bopli-release-hash` file for CI upload paths. Until Bopli is explicitly declared production, the protocol, manifest schema, runtime ABI, and nested recipe versions always remain `1`; package and theme-release versions use SemVer independently.

`package` performs the same validated production build and writes `{handle}-{version}-{release-hash}.zip` beside the theme source. The archive contains only the path-sorted contents of `dist/` at its root and normalizes timestamps, permissions, compression, and entry ordering, so the same release produces byte-identical ZIP output. It is ready for the landlord **Upload release** workflow.

`dev` accepts a relative theme path, starts a CORS-restricted Vite watch server, and can register the development release through the local Bopli Docker stack. Production registration is always performed by Bopli's `bopli:theme:install` command against the uploaded HTTPS `theme.json` URL.

Themes may import relative files, `vue`, and `@bopli/theme-sdk`. The exact Shiki core, JavaScript engine, GitHub Dark theme, and language subpaths used by Dev Cosmo are also allowed; other package imports remain rejected. Application aliases, Inertia, Node built-ins, remote imports, and non-literal dynamic imports are rejected before Vite runs.

Every theme supplies templates only under `resources/js/templates/pages` and `resources/js/templates/entries`, with at least one ordinary Page and one generic Entry template and exactly one default of each kind. Directory placement infers ordinary kinds. Native Blog templates opt in with `"kind": "blog_index"` in `pages` or `"kind": "blog_post"` in `entries`; they follow the same paired-default rule. Legacy `blogs` and `posts` roots are rejected. A single candidate becomes the default automatically; variants mark one `<bopli>` metadata block with `"default": true`. Entry projection fields cannot shadow Bopli metadata such as `url`, SEO, or adjacent-navigation keys. Page slot declarations are obsolete and rejected.

Themes select the dynamic collections needed by their design through the host-injected `BopliContentClient` or `useBopliQuery()`. The browser host currently provides a bounded same-origin transport; the interface and Vue server-prefetch integration allow a future SSR host to supply a server transport without rewriting theme components.

Themes may add a bounded `resources/bopli/starter.json` recipe. The CLI validates its Content Models, fields, routes, Entries, Pages, Blog setting, and template references before embedding it in the release descriptor. Bopli applies this recipe per Site during provisioning or an explicit Appearance import; globally installing a release never creates tenant content.
