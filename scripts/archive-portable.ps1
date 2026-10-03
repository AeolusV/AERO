# AERO original portions: Copyright (c) 2026 Aeolus. See LICENSE.
param(
  [Parameter(Mandatory = $true)][string]$PackageDirectory,
  [Parameter(Mandatory = $true)][string]$ArchivePath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$packageRoot = (Resolve-Path -LiteralPath $PackageDirectory).Path
$manifest = Join-Path $packageRoot "SHA256SUMS.txt"
if (-not (Test-Path -LiteralPath (Join-Path $packageRoot "AERO.exe")) -or -not (Test-Path -LiteralPath $manifest)) { throw "Incomplete portable candidate." }
if (@(Get-ChildItem -LiteralPath $packageRoot -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw "Reparse points are not permitted in the candidate." }
$listedFiles = @{}
foreach ($line in Get-Content -LiteralPath $manifest -Encoding UTF8) {
  if (-not $line) { continue }
  if ($line -notmatch "^([a-fA-F0-9]{64})  (.+)$") { throw "Malformed checksum manifest." }
  $hash = $Matches[1]
  $file = [IO.Path]::GetFullPath((Join-Path $packageRoot $Matches[2]))
  if (-not $file.StartsWith($packageRoot.TrimEnd("\") + "\", [StringComparison]::OrdinalIgnoreCase)) { throw "Checksum path escapes the candidate." }
  if ($listedFiles.ContainsKey($file)) { throw "Duplicate checksum entry." }
  $listedFiles[$file] = $true
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $hash) { throw "Candidate checksum mismatch." }
}
foreach ($file in Get-ChildItem -LiteralPath $packageRoot -Recurse -File -Force) {
  if ($file.FullName -ne $manifest -and -not $listedFiles.ContainsKey($file.FullName)) { throw "Unlisted file in candidate." }
}
$archive = [IO.Path]::GetFullPath($ArchivePath)
if ([IO.Path]::GetExtension($archive) -ne ".zip") { throw "Use a .zip archive path." }
if ($archive.StartsWith($packageRoot.TrimEnd("\") + "\", [StringComparison]::OrdinalIgnoreCase)) { throw "Archive output must be outside the candidate." }
if ((Test-Path -LiteralPath $archive) -or (Test-Path -LiteralPath "$archive.sha256")) { throw "Output exists; choose a new archive path." }
New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($archive)) -Force | Out-Null
Compress-Archive -LiteralPath $packageRoot -DestinationPath $archive -CompressionLevel Optimal
$sum = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$archive.sha256", "$sum  $([IO.Path]::GetFileName($archive))`n", [Text.UTF8Encoding]::new($false))
Write-Output "ARCHIVE_OK $archive"
Write-Output "SHA256 $sum"
