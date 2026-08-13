# @bopli/theme-sdk

Public TypeScript contracts and Vue navigation helpers for independently deployed Bopli themes.

```sh
npm install --save-dev @bopli/theme-sdk
```

Theme code may import the generic Page, Entry, and Blog props contracts filled by `bopli-theme types`, plus `useBopliNavigation` and `useBopliQuery` for host-owned navigation and published-content access. Content source and built-in sort strings are closed protocol types, so misspellings fail during type checking. The package contains no Bopli application internals.

See the [Bopli theme toolkit](https://github.com/jcfrane/bopli-theme-toolkit) for the complete authoring and release workflow.
