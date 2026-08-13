# @bopli/theme-cli

Validate, build, and locally serve convention-based Vue themes for Bopli.

```sh
npm install --save-dev @bopli/theme-cli @bopli/theme-sdk
npx bopli-theme validate .
npx bopli-theme types .
npx bopli-theme build .
npx bopli-theme dev . --app ../bopli-app
```

`types` derives `resources/js/.bopli/types.d.ts` from `bopli.settings` and template `<bopli>` field contracts. `build`, `package`, and `dev` regenerate it automatically. The compiler enforces the public import boundary and emits a self-contained ESM runtime, CSS, artifact inventory, and protocol-v1 `theme.json` for immutable CDN publication.

See the [Bopli theme toolkit](https://github.com/jcfrane/bopli-theme-toolkit) for theme conventions and release workflows.
