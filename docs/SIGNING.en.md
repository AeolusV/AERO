# Windows signing and release

[简体中文](SIGNING.md) · **English**

[Developer guide](DEVELOPMENT.en.md) · [Product overview](../README.en.md)

The signing workflow is prepared, but the current candidate remains unsigned. Real desktop behavior and first-user setup still need validation before a public release; this guide does not imply those checks are complete.

## Prerequisites

- Windows SDK `signtool.exe`. The script discovers an installed x64 tool or accepts an explicit `-SignToolPath`.
- A valid code-signing certificate matching the intended publisher, with an accessible private key and Code Signing usage. Select it explicitly; the script does not choose one automatically.
- An HTTPS RFC 3161 timestamp endpoint supported by your certificate provider.

Prefer the Windows certificate store and the provider's hardware or managed-key integration, without exporting private keys. The script does not accept PFX files, passwords or cloud tokens. Keep them out of source control, logs, chats and command lines. Purchasing certificates, activating services or incurring costs requires a separate decision by the author. A self-signed certificate is not a publicly trusted publisher identity.

## Read-only preflight

The default mode does not contact a timestamp server or modify the candidate:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sign-portable.ps1 `
  -PackageDirectory 'complete candidate folder'
```

The result reports tool, certificate, timestamp and output readiness. `ExecutionPolicy Bypass` affects only this PowerShell process, not system policy. Use it only for repository scripts you have inspected and trust.

## Sign with an explicitly selected certificate

A certificate thumbprint is a public identifier, not a private key. Replace placeholders with the actual thumbprint, provider endpoint and a new output directory. The default store is `CurrentUser\My`; select `-StoreLocation LocalMachine` explicitly for the machine store.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/sign-portable.ps1 `
  -PackageDirectory 'complete candidate folder' `
  -CertificateThumbprint '40-character certificate thumbprint' `
  -TimestampUrl 'https://your-provider-timestamp-endpoint' `
  -OutputDirectory 'new signed output directory'
```

Confirm `ready: true`, then add `-Execute` to the same command. Execution checks candidate file hashes, copies the folder and signs only the new copy of `AERO.exe`. The input and existing outputs are never overwritten.

The workflow uses a SHA-256 file digest and a SHA-256 RFC 3161 timestamp, then runs `signtool verify /pa /all`. It also requires a valid Windows signature, the explicitly selected signer thumbprint and a timestamp. Only then does it update getting-started notes and `SHA256SUMS.txt`, reporting `SIGNED_PORTABLE_OK`. Failed copies are retained for diagnosis and must not be distributed.

## Boundaries

- Only `AERO.exe` is signed. Unarchived JS, Python and PowerShell resources are not covered. Per-file checksums aid integrity checks but do not replace signature coverage or an independently trusted checksum source.
- A valid executable signature proves neither functional correctness nor that Windows SmartScreen will stop warning.
- There is no automatic updater, installer or public Release yet. Each needs its own signing and verification design if introduced.
- Finish executable icons and publisher metadata before signing. Any later executable change requires signing again.
- Final order: build and branding → desktop validation → sign and verify → refresh checksums → archive the complete folder → hash the archive → publish only after author confirmation.

References: [Microsoft SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool), [Authenticode timestamps](https://learn.microsoft.com/en-us/windows/win32/seccrypto/time-stamping-authenticode-signatures).
