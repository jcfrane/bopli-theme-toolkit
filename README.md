# Bopli theme toolkit

This repository owns the public, versioned boundary between Bopli and independently deployed themes.

Licensed under the MIT License.

- `@bopli/theme-sdk` contains the browser runtime types and navigation injection helper.
- `@bopli/theme-cli` validates, builds, and serves convention-based Vue themes without access to Bopli application source.
- `starter-theme/` is the minimal source scaffold.

## Commands

```sh
npm install
node packages/cli/bin/bopli-theme.js validate ../dev-cosmo
node packages/cli/bin/bopli-theme.js build ../dev-cosmo
node packages/cli/bin/bopli-theme.js dev ../dev-cosmo --app ../bopli-app
```

`build` writes immutable ESM, CSS, assets, and protocol-v3 `theme.json` to the theme's `dist/` directory. It also writes the computed release hash to the ignored `.bopli-release-hash` file for CI upload paths.

`dev` accepts a relative theme path, starts a CORS-restricted Vite watch server, and can register the development release through the local Bopli Docker stack. Production registration is always performed by Bopli's `bopli:theme:install` command against the uploaded HTTPS `theme.json` URL.

Themes may import relative files, `vue`, and `@bopli/theme-sdk`. Application aliases, Inertia, Node built-ins, remote imports, arbitrary packages, and non-literal dynamic imports are rejected before Vite runs.
