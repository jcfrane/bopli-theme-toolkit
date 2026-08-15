# @bopli/theme-cli

Create, validate, build, and locally preview convention-based Vue themes for Bopli.

```sh
npx @bopli/theme-cli create my-theme
cd my-theme
npm install
npm run dev
```

Inside a generated theme:

```sh
npx bopli-theme validate .
npx bopli-theme types .
npx bopli-theme build .
npx bopli-theme dev .
npx bopli-theme dev . --app ../bopli-app --docker-service php
```

`create` generates a pinned standalone repository from the checked starter scaffold. `dev` serves a fixture-backed preview with template and setting controls by default; pass `--app` for full Bopli integration. `types` derives `resources/js/.bopli/types.d.ts` from `bopli.settings` and template `<bopli>` field contracts. `build`, `package`, and `dev` regenerate it automatically. The compiler enforces the public import boundary and emits a self-contained ESM runtime, CSS, artifact inventory, and protocol-v1 `theme.json` for immutable CDN publication.

See the [Bopli theme toolkit](https://github.com/jcfrane/bopli-theme-toolkit) for theme conventions and release workflows.
