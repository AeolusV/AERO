param(
  [Parameter(Mandatory = $true)]
  [string]$RuntimeRoot,
  [switch]$Plan
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Emit-Event {
  param(
    [string]$Event,
    [string]$Status,
    [int]$Progress,
    [string]$Message,
    [hashtable]$Extra = @{}
  )
  $payload = [ordered]@{
    event = $Event
    status = $Status
    progress = $Progress
    message = $Message
  }
  foreach ($key in $Extra.Keys) { $payload[$key] = $Extra[$key] }
  [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress -Depth 8))
}

function Invoke-Checked {
  param([string]$FilePath, [string[]]$Arguments, [hashtable]$Environment = @{})
  foreach ($key in $Environment.Keys) { Set-Item -LiteralPath "Env:$key" -Value $Environment[$key] }
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$FilePath exited with code $LASTEXITCODE" }
}

function Download-File {
  param([string]$Url, [string]$Destination, [int]$Progress, [string]$Message)
  Emit-Event -Event "progress" -Status "downloading" -Progress $Progress -Message $Message
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination
}

function Test-Model {
  param([string]$ModelPath)
  return (Test-Path -LiteralPath (Join-Path $ModelPath "am\final.mdl")) -and
    (Test-Path -LiteralPath (Join-Path $ModelPath "conf\mfcc.conf"))
}

$manifestPath = Join-Path $PSScriptRoot "runtime-sources.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$architecture = if (($env:PROCESSOR_ARCHITEW6432 -eq "ARM64") -or ($env:PROCESSOR_ARCHITECTURE -eq "ARM64")) { "arm64" } else { "x64" }
$uvAsset = $manifest.uv.assets.$architecture
$runtimeRootResolved = [System.IO.Path]::GetFullPath($RuntimeRoot)
$toolsRoot = Join-Path $runtimeRootResolved "tools"
$downloadsRoot = Join-Path $runtimeRootResolved "downloads"
$pythonRoot = Join-Path $runtimeRootResolved "python"
$venvRoot = Join-Path $runtimeRootResolved "venv"
$modelsRoot = Join-Path $runtimeRootResolved "models"
$cacheRoot = Join-Path $runtimeRootResolved "cache"
$uvExe = Join-Path $toolsRoot "uv.exe"
$pythonExe = Join-Path $venvRoot "Scripts\python.exe"
$modelPath = Join-Path $modelsRoot $manifest.model.name

if ($Plan) {
  Emit-Event -Event "plan" -Status "idle" -Progress 0 -Message "AERO managed wake runtime plan" -Extra @{
    architecture = $architecture
    runtimeRoot = $runtimeRootResolved
    uvUrl = $uvAsset.url
    uvChecksumUrl = $uvAsset.checksumUrl
    pythonVersion = $manifest.python.version
    packages = @($manifest.packages)
    modelUrl = $manifest.model.url
    modelSha256 = $manifest.model.sha256
    pythonPath = $pythonExe
    modelPath = $modelPath
  }
  exit 0
}

try {
  if ($env:OS -ne "Windows_NT") { throw "AERO one-click wake runtime currently supports Windows only" }
  foreach ($directory in @($runtimeRootResolved, $toolsRoot, $downloadsRoot, $pythonRoot, $modelsRoot, $cacheRoot)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  Emit-Event -Event "progress" -Status "checking" -Progress 4 -Message "Checking managed runtime"

  if (-not (Test-Path -LiteralPath $uvExe)) {
    $uvArchive = Join-Path $downloadsRoot "uv-$($manifest.uv.version)-$architecture.zip"
    $uvChecksum = "$uvArchive.sha256"
    Download-File -Url $uvAsset.url -Destination $uvArchive -Progress 8 -Message "Downloading verified uv runtime from GitHub"
    Download-File -Url $uvAsset.checksumUrl -Destination $uvChecksum -Progress 17 -Message "Downloading uv checksum"
    $expectedUvHash = ((Get-Content -LiteralPath $uvChecksum -Raw -Encoding UTF8).Trim() -split "\s+")[0].ToUpperInvariant()
    $actualUvHash = (Get-FileHash -LiteralPath $uvArchive -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actualUvHash -ne $expectedUvHash) { throw "uv archive checksum mismatch" }
    Emit-Event -Event "progress" -Status "installing" -Progress 22 -Message "Extracting uv runtime"
    Expand-Archive -LiteralPath $uvArchive -DestinationPath $toolsRoot -Force
    if (-not (Test-Path -LiteralPath $uvExe)) { throw "uv.exe was not found after extraction" }
  }

  $uvEnvironment = @{
    UV_PYTHON_INSTALL_DIR = $pythonRoot
    UV_CACHE_DIR = $cacheRoot
    UV_PYTHON_INSTALL_REGISTRY = "0"
    UV_NO_CONFIG = "1"
  }

  Emit-Event -Event "progress" -Status "installing" -Progress 30 -Message "Installing isolated Python $($manifest.python.version)"
  Invoke-Checked -FilePath $uvExe -Arguments @("python", "install", $manifest.python.version, "--install-dir", $pythonRoot, "--no-bin", "--no-registry", "--no-progress") -Environment $uvEnvironment

  if (-not (Test-Path -LiteralPath $pythonExe)) {
    Emit-Event -Event "progress" -Status "installing" -Progress 43 -Message "Creating AERO wake environment"
    Invoke-Checked -FilePath $uvExe -Arguments @("venv", $venvRoot, "--python", $manifest.python.version, "--managed-python", "--no-progress") -Environment $uvEnvironment
  }

  Emit-Event -Event "progress" -Status "installing" -Progress 53 -Message "Installing offline speech dependencies"
  $packageArguments = @("pip", "install", "--python", $pythonExe, "--no-progress") + @($manifest.packages)
  Invoke-Checked -FilePath $uvExe -Arguments $packageArguments -Environment $uvEnvironment

  if (-not (Test-Model -ModelPath $modelPath)) {
    $modelArchive = Join-Path $downloadsRoot "$($manifest.model.name).zip"
    Download-File -Url $manifest.model.url -Destination $modelArchive -Progress 64 -Message "Downloading official English Vosk model"
    Emit-Event -Event "progress" -Status "verifying" -Progress 82 -Message "Verifying speech model"
    $actualModelHash = (Get-FileHash -LiteralPath $modelArchive -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actualModelHash -ne $manifest.model.sha256.ToUpperInvariant()) { throw "Vosk model checksum mismatch" }
    Emit-Event -Event "progress" -Status "installing" -Progress 88 -Message "Extracting speech model"
    Expand-Archive -LiteralPath $modelArchive -DestinationPath $modelsRoot -Force
  }

  if (-not (Test-Model -ModelPath $modelPath)) { throw "Vosk model is incomplete after extraction" }
  Emit-Event -Event "progress" -Status "verifying" -Progress 95 -Message "Verifying Python imports"
  Invoke-Checked -FilePath $pythonExe -Arguments @("-c", "import vosk, sounddevice; print('AERO_WAKE_RUNTIME_OK')")

  Emit-Event -Event "complete" -Status "ready" -Progress 100 -Message "Local wake runtime is ready" -Extra @{
    pythonPath = $pythonExe
    modelPath = $modelPath
    runtimeRoot = $runtimeRootResolved
    modelSource = $manifest.model.source
  }
} catch {
  Emit-Event -Event "error" -Status "error" -Progress 0 -Message $_.Exception.Message
  exit 1
}
