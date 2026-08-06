# @bopli/theme-cli

Validate, build, and locally serve convention-based Vue themes for Bopli.

```sh
npm install --save-dev @bopli/theme-cli @bopli/theme-sdk
npx bopli-theme validate .
npx bopli-theme build .
npx bopli-theme dev . --app ../bopli-app
```

The compiler enforces the public import boundary and emits a self-contained ESM runtime, CSS, artifact inventory, and protocol-v3 `theme.json` for immutable CDN publication.

See the [Bopli theme toolkit](https://github.com/jcfrane/bopli-theme-toolkit) for theme conventions and release workflows.
