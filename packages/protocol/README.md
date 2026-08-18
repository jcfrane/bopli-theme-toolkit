# `@bopli/theme-protocol`

This package is the machine-readable source of truth for Bopli theme protocol v1.

It owns the Draft 2020-12 JSON Schemas for:

- the `package.json#bopli` declaration;
- template `<bopli lang="json">` metadata;
- `resources/bopli/starter.json`;
- compiled `theme.json` release descriptors;
- shared setting types, content field types, template kinds, reserved entry fields, and protocol constants.

The package's SemVer version is independent from the contained pre-production protocol version. For example, package `0.1.0` contains protocol/schema/runtime version `1`.

## Consumers

`@bopli/theme-cli` imports the schemas, generated types, validators, constants, and vocabularies directly. `bopli-app` commits a checksum-verified generated copy of the schemas so PHP validates uploaded JSON without requiring Node, the toolkit checkout, or network access at runtime.

Standard JSON Schema owns structural validation. Semantic relationships that cannot be represented cleanly in Draft 2020-12 remain explicit in each consumer, such as default-template cardinality, Blog template pairing, and starter cross-references.

## Development

From the toolkit root:

```sh
npm run protocol:check
npm test
```

After rebuilding the starter theme, `npm run build:starter` refreshes the shared real-world descriptor fixture. In the adjacent application, `npm run protocol:sync` refreshes the pinned schema, starter fixture, and SDK declaration snapshots.
