# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [1.1.0] - 2026-10-06

### Added

- Ultenic robot vacuum integration for Gladys
- QR-free authorization mode, and honest docs about the Ultenic app
- `SECURITY.md`: how to report a vulnerability.
- `CHANGELOG.md`, rebuilt from the release history.
- `CLAUDE.md`: guide for contributors and coding agents (commands, architecture, invariants).

### Changed

- Development dependencies updated to their latest versions (ESLint 10.12, Prettier 3.9.9, globals 17.13).
- Integration SDK upgraded from 0.11 to 0.14.

[Unreleased]: https://github.com/prohand/gladys-ultenic/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/prohand/gladys-ultenic/releases/tag/v1.1.0

### Fixed

- A vacuum added from the Discovery tab while it sat on its dock shows its values right away: its states are published again when Gladys creates the device, instead of waiting for a value to change.
- `gladys_version` raised to `>=5.1.0`: the "Locate a vacuum" action uses a device select, which the core only accepts from Gladys 5.1.0.
- The Release workflow re-runs Prettier on the manifest after `jq`.
