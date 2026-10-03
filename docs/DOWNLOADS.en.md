# Downloads and verification

[简体中文](DOWNLOADS.md) · **English**

[User guide](USAGE.en.md) · [Developer guide](DEVELOPMENT.en.md) · [Signing](SIGNING.en.md)

The current version is **0.1.0-beta.1**, for Windows x64 users who want an early look. [Explore this beta](BETA.en.md). Downloads are unsigned; this is not a stable release or confirmation of all desktop behavior.

## Download the beta

Download the application ZIP from **Assets** on [AERO 0.1.0 Beta 1](https://github.com/AeolusV/AERO/releases/tag/v0.1.0-beta.1). Release assets do not have the Actions 14-day automatic expiry; they remain available unless a maintainer removes or replaces them.

Choose the `.zip` beginning with `AERO-0.1.0-beta.1-win-x64`, plus its matching `.sha256` file. `provenance.jsonl` contains build provenance. GitHub's automatic **Source code** downloads are source, not runnable application packages.

Verify the application ZIP, extract the entire folder and run `AERO.exe`. Do not move the exe alone. No installation is needed.

## Actions candidates (maintainers)

Maintainers select **Windows portable candidate → Run workflow → main** in [Actions](https://github.com/AeolusV/AERO/actions/workflows/portable-candidate.yml). The run checks out its source commit, installs locked dependencies, runs regressions, builds and checks isolated packaged startup, then produces a ZIP, SHA-256 checksum and provenance attestation. It does not connect to real Codex, record audio, send a voice hotkey or modify personal settings.

After a successful run, download the candidate from that run's Artifacts (GitHub may require sign-in). Artifacts are retained for 14 days, not a permanent Release link. The download includes:

- A complete application ZIP named with the source commit prefix.
- A matching `.zip.sha256` file.
- A `provenance.jsonl` verification bundle.

Extract the outer Actions download first, then verify the application ZIP inside it. After verification, extract the entire application ZIP and run `AERO.exe` from its folder. Do not extract or move only the exe.

## Verify the ZIP

```powershell
Get-FileHash -LiteralPath '.\your-application.zip' -Algorithm SHA256
Get-Content -LiteralPath '.\your-application.zip.sha256'
```

The hashes should match. Matching hashes detect file changes; they alone do not establish trust if both the file and checksum come from an untrusted source.

With GitHub CLI installed, verify provenance online:

```powershell
gh attestation verify '.\your-application.zip' --repo AeolusV/AERO
```

Confirm the output identifies AERO, the candidate workflow and the intended source commit. Verify the ZIP, not an individual exe extracted from it. The included `BUILD-INFO.json` records version and build commit; `SHA256SUMS.txt` lists per-file checksums.

## Before use

Provenance identifies the build origin. It is not Windows publisher signing, a security audit, proof of reproducibility or functional acceptance. Windows security warnings may still occur; do not disable system security. Human acceptance testing is not a prerequisite for this beta: real voice wake-up and the full desktop interaction flow have not received end-to-end acceptance testing in this round. They remain available to try, not certified as a stable experience.

The beta is a GitHub pre-release, not a stable release. The build workflow still does not create Releases automatically; maintainers publish public assets separately.

Reference: [GitHub build provenance](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
