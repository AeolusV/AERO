# AERO original portions: Copyright (c) 2026 Aeolus. See LICENSE.
# Default is a read-only plan. Private keys remain in the Windows certificate provider.
param(
  [Parameter(Mandatory = $true)][string]$PackageDirectory,
  [string]$CertificateThumbprint = "",
  [ValidateSet("CurrentUser", "LocalMachine")][string]$StoreLocation = "CurrentUser",
  [string]$TimestampUrl = "",
  [string]$SignToolPath = "",
  [string]$OutputDirectory = "",
  [switch]$Execute
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($env:OS -ne "Windows_NT") { throw "Windows is required." }
$packageRoot = (Resolve-Path -LiteralPath $PackageDirectory).Path
$manifestPath = Join-Path $packageRoot "resources\app\package.json"
$inputExe = Join-Path $packageRoot "AERO.exe"
foreach ($file in @($manifestPath, $inputExe, (Join-Path $packageRoot "SHA256SUMS.txt"))) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Incomplete portable package." }
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.productName -ne "AERO" -or $manifest.main -ne "electron/main.cjs") { throw "Not an AERO portable package." }

if (-not $SignToolPath) {
  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) { $SignToolPath = $command.Source }
  else {
    $sdkRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
    if (Test-Path -LiteralPath $sdkRoot) {
      $sdkVersions = Get-ChildItem -LiteralPath $sdkRoot -Directory |
        Where-Object { $_.Name -match "^\d+\.\d+\.\d+\.\d+$" } |
        Sort-Object { [version]$_.Name } -Descending
      foreach ($sdk in $sdkVersions) {
        $candidate = Join-Path $sdk.FullName "x64\signtool.exe"
        if (Test-Path -LiteralPath $candidate) { $SignToolPath = $candidate; break }
      }
    }
  }
}
$toolReady = [bool]($SignToolPath -and (Test-Path -LiteralPath $SignToolPath -PathType Leaf))
$thumbprint = ($CertificateThumbprint -replace "\s", "").ToUpperInvariant()
if ($thumbprint -and $thumbprint -notmatch "^[A-F0-9]{40}$") { throw "Use the certificate SHA-1 thumbprint, not a password or certificate file." }
$certificate = $null
if ($thumbprint) { $certificate = Get-Item -LiteralPath "Cert:\$StoreLocation\My\$thumbprint" -ErrorAction SilentlyContinue }
$certificateReady = [bool]($certificate -and $certificate.HasPrivateKey -and
  $certificate.NotBefore -le (Get-Date) -and $certificate.NotAfter -gt (Get-Date) -and
  @($certificate.Extensions | Where-Object { $_.Oid.Value -eq "2.5.29.37" } |
    ForEach-Object { $_.EnhancedKeyUsages } | Where-Object { $_.Value -eq "1.3.6.1.5.5.7.3.3" }).Count -gt 0)
$timestampReady = $false
if ($TimestampUrl) {
  $timestampUri = $null
  $timestampReady = [Uri]::TryCreate($TimestampUrl, [UriKind]::Absolute, [ref]$timestampUri) -and $timestampUri.Scheme -eq "https"
}
$blockers = @()
if (-not $toolReady) { $blockers += "SignTool is missing" }
if (-not $certificateReady) { $blockers += "Select a valid code-signing certificate with a private key in the chosen store" }
if (-not $timestampReady) { $blockers += "Specify the issuer's HTTPS RFC 3161 timestamp URL" }
if (-not $OutputDirectory) { $blockers += "Specify a new output directory" }

if (-not $Execute) {
  [ordered]@{
    mode = "plan"; version = $manifest.version; signToolReady = $toolReady;
    certificateReady = $certificateReady; timestampConfigured = $timestampReady;
    ready = $blockers.Count -eq 0; blockers = $blockers; targets = @("AERO.exe");
    coverage = "Authenticode covers AERO.exe, not the unpacked application resources";
    privateKeyExported = $false
  } | ConvertTo-Json -Depth 4
  exit 0
}
if ($blockers.Count) { throw ($blockers -join "; ") }

# Verify the unsigned candidate before copying; never sign an unknown or edited candidate.
foreach ($line in Get-Content -LiteralPath (Join-Path $packageRoot "SHA256SUMS.txt") -Encoding UTF8) {
  if (-not $line) { continue }
  if ($line -notmatch "^([a-fA-F0-9]{64})  (.+)$") { throw "Malformed checksum manifest." }
  $expectedHash = $Matches[1]
  $relativeName = $Matches[2]
  $targetPath = [IO.Path]::GetFullPath((Join-Path $packageRoot $relativeName))
  if (-not $targetPath.StartsWith($packageRoot.TrimEnd("\") + "\", [StringComparison]::OrdinalIgnoreCase)) { throw "Checksum path escapes the package." }
  if ((Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash -ne $expectedHash) { throw "Candidate checksum mismatch." }
}
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$signedRoot = Join-Path $outputRoot ("AERO-" + $manifest.version + "-win-x64-signed")
if ($signedRoot.StartsWith($packageRoot.TrimEnd("\") + "\", [StringComparison]::OrdinalIgnoreCase)) { throw "Output cannot be inside the input package." }
if (Test-Path -LiteralPath $signedRoot) { throw "Output exists; preserve it and choose a new directory." }
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
Copy-Item -LiteralPath $packageRoot -Destination $signedRoot -Recurse
$signedExe = Join-Path $signedRoot "AERO.exe"
$arguments = @("sign", "/sha1", $thumbprint, "/s", "My", "/fd", "SHA256", "/tr", $TimestampUrl, "/td", "SHA256", "/d", "AERO", "/du", "https://github.com/AeolusV/AERO")
if ($StoreLocation -eq "LocalMachine") { $arguments += "/sm" }
$arguments += $signedExe
& $SignToolPath @arguments
if ($LASTEXITCODE -ne 0) { throw "Signing failed. Retain the candidate for inspection; do not distribute it." }
& $SignToolPath verify /pa /all $signedExe
if ($LASTEXITCODE -ne 0) { throw "Signature verification failed. Do not distribute this candidate." }
$signature = Get-AuthenticodeSignature -LiteralPath $signedExe
if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Thumbprint -ne $thumbprint -or -not $signature.TimeStamperCertificate) {
  throw "A trusted signature by the selected certificate with a timestamp is required."
}

$startHerePath = Join-Path $signedRoot "START-HERE.txt"
$startHere = Get-Content -LiteralPath $startHerePath -Raw -Encoding UTF8
$startHere = $startHere.Replace("此预览未签名，Windows 可能提示未知发布者。请核对来源，不要关闭系统安全保护。", "AERO.exe 已签名；签名不保证 Windows 不显示信誉提示，请核对发布者与来源。")
$startHere = $startHere.Replace("Unsigned preview: Windows may warn about an unknown publisher. Verify its source; do not disable system security.", "AERO.exe is signed. Windows reputation warnings may still appear. Verify the publisher and source.")
[IO.File]::WriteAllText($startHerePath, $startHere, [Text.UTF8Encoding]::new($false))
$hashes = Get-ChildItem -LiteralPath $signedRoot -File -Recurse |
  Where-Object { $_.FullName -ne (Join-Path $signedRoot "SHA256SUMS.txt") } |
  Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($signedRoot.Length + 1).Replace("\", "/")
    (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() + "  " + $relative
  }
[IO.File]::WriteAllText((Join-Path $signedRoot "SHA256SUMS.txt"), ($hashes -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
Write-Output "SIGNED_PORTABLE_OK $signedRoot"
