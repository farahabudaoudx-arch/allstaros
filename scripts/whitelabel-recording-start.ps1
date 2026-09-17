param(
  [switch]$Rebuild,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$root = "E:\LocalPilot\whitelabel-pilot"
$registryPath = Join-Path $root "registry.json"
$preflightPath = Join-Path $root "recording-preflight.json"
$tlsDir = Join-Path $root "tls"
$recordingHost = "customer-a.local"
$controlPort = 3201
$customerPort = 3102
$proxyPort = 443
$supabaseCli = "/home/yahia/.local/bin/supabase-2.117.0"
$customerAWorkdir = "/mnt/e/LocalPilot/whitelabel-customer-a"
$customerBWorkdir = "/mnt/e/LocalPilot/whitelabel-customer-b"
$sourceSha = (& git -C $repo rev-parse HEAD).Trim()
$markerDir = Join-Path $repo ".tmp-local-demo"
$buildMarker = Join-Path $markerDir "recording-head.txt"
$logDir = Join-Path $root "logs"
$script:recordingBuildRebuilt = $false

New-Item -ItemType Directory -Force -Path $root, $tlsDir, $markerDir, $logDir | Out-Null

function Test-Url([string]$Url, [int]$TimeoutSec = 4) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  } catch {
    return $false
  }
}

function Wait-Url([string]$Label, [string]$Url, [int]$Attempts = 60) {
  for ($i = 0; $i -lt $Attempts; $i++) {
    if (Test-Url $Url) {
      Write-Host "[OK] $Label"
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "$Label did not become ready at $Url."
}

function Test-Port([int]$Port) {
  return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Stop-StaleRecordingProcess([int]$Port, [string]$Label) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) { return $false }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  $commandLine = [string]$process.CommandLine
  $owned =
    $commandLine -match "whitelabel-local-pilot-serve\.mjs" -or
    $commandLine -match "whitelabel-local-demo-start\.mjs" -or
    $commandLine -match "whitelabel-recording-proxy\.mjs" -or
    $commandLine -match "customer-a-tls[\\/]proxy\.cjs" -or
    ($commandLine -match "next(?:\.cmd)?\s+(?:dev|start)" -and $commandLine -match "(?:-p|--port)\s+$Port")
  if (-not $owned) { return $false }
  Write-Host "Replacing stale local $Label process on port $Port..."
  Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
  for ($i = 0; $i -lt 20; $i++) {
    if (-not (Test-Port $Port)) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return (-not (Test-Port $Port))
}

function Start-HiddenNode([string[]]$Arguments, [string]$Name) {
  $stdout = Join-Path $logDir "$Name.out.log"
  $stderr = Join-Path $logDir "$Name.err.log"
  Start-Process -FilePath (Get-Command node).Source `
    -ArgumentList $Arguments `
    -WorkingDirectory $repo `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr | Out-Null
}

function Ensure-WslDocker {
  Write-Host "Starting WSL/Docker keep-alive..."
  $keepAlive = "sudo -n systemctl start docker; exec tail -f /dev/null"
  Start-Process -FilePath "wsl.exe" `
    -ArgumentList @("-d", "Ubuntu-22.04", "--", "bash", "-lc", $keepAlive) `
    -WindowStyle Hidden | Out-Null

  for ($i = 0; $i -lt 30; $i++) {
    & wsl.exe -d Ubuntu-22.04 -- docker info *> $null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "[OK] WSL Docker"
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "Docker inside Ubuntu-22.04 did not become ready."
}

function Ensure-Supabase([string]$Label, [string]$Workdir, [string]$HealthUrl) {
  & wsl.exe -d Ubuntu-22.04 -- bash -lc "$supabaseCli start --workdir $Workdir >/tmp/$Label-supabase-start.log 2>&1 || true"
  Wait-Url "$Label Supabase" $HealthUrl 90
}

function Read-SupabaseStatus([string]$Workdir) {
  $raw = & wsl.exe -d Ubuntu-22.04 -- bash -lc "$supabaseCli status --workdir $Workdir -o json"
  if ($LASTEXITCODE -ne 0) { throw "Could not read Supabase status for $Workdir." }
  return (($raw -join "`n") | ConvertFrom-Json)
}

function Write-RecordingRegistry {
  $a = Read-SupabaseStatus $customerAWorkdir
  $b = Read-SupabaseStatus $customerBWorkdir
  $existingControl = $null
  if (Test-Path -LiteralPath $registryPath) {
    try {
      $existing = Get-Content -Raw -LiteralPath $registryPath | ConvertFrom-Json
      $existingControl = @($existing.projects) | Where-Object { $_.projectRef -eq "local-control" } | Select-Object -First 1
    } catch {
      $existingControl = $null
    }
  }

  $projects = @()
  if ($existingControl) { $projects += $existingControl }
  $projects += [ordered]@{
    projectRef = "local-customer-a"
    accountRef = "local"
    apiUrl = [string]$a.API_URL
    dbUrl = [string]$a.DB_URL
    publishableKey = [string]$a.PUBLISHABLE_KEY
    secretKey = [string]$a.SECRET_KEY
    canonicalAppUrl = "https://control-a.local"
    runtimeAppUrl = "http://127.0.0.1:$controlPort"
  }
  $projects += [ordered]@{
    projectRef = "local-customer-b"
    accountRef = "local"
    apiUrl = [string]$b.API_URL
    dbUrl = [string]$b.DB_URL
    publishableKey = [string]$b.PUBLISHABLE_KEY
    secretKey = [string]$b.SECRET_KEY
    canonicalAppUrl = "https://$recordingHost"
    runtimeAppUrl = "http://127.0.0.1:$customerPort"
  }
  $registryJson = @{ projects = $projects } | ConvertTo-Json -Depth 8
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($registryPath, $registryJson, $utf8NoBom)
  Write-Host "[OK] Recording registry"
}

function Ensure-HostsEntry {
  $resolved = Resolve-DnsName $recordingHost -Type A -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -eq "127.0.0.1" }
  if ($resolved) {
    Write-Host "[OK] hosts/DNS"
    return
  }
  Write-Host "Windows needs one UAC approval to register $recordingHost locally."
  $helper = Join-Path $PSScriptRoot "whitelabel-recording-hosts.ps1"
  $argumentList = "-NoProfile -ExecutionPolicy Bypass -File `"$helper`" -HostName `"$recordingHost`""
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList $argumentList -Verb RunAs -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Could not add $recordingHost to the Windows hosts file." }
  $resolved = Resolve-DnsName $recordingHost -Type A -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -eq "127.0.0.1" }
  if (-not $resolved) { throw "$recordingHost still does not resolve to 127.0.0.1." }
  Write-Host "[OK] hosts/DNS"
}

function Ensure-TlsCertificate {
  $keyPath = Join-Path $tlsDir "$recordingHost.key.pem"
  $certPath = Join-Path $tlsDir "$recordingHost.crt.pem"
  if (-not (Test-Path -LiteralPath $keyPath) -or -not (Test-Path -LiteralPath $certPath)) {
    $openssl = (Get-Command openssl -ErrorAction SilentlyContinue).Source
    if (-not $openssl) {
      $candidate = "C:\Program Files\Git\usr\bin\openssl.exe"
      if (Test-Path -LiteralPath $candidate) { $openssl = $candidate }
    }
    if (-not $openssl) { throw "OpenSSL is required once to create the local recording certificate." }
    $opensslOut = Join-Path $logDir "recording-openssl.out.log"
    $opensslErr = Join-Path $logDir "recording-openssl.err.log"
    $opensslArgs = @(
      "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "3650", "-nodes",
      "-keyout", $keyPath,
      "-out", $certPath,
      "-subj", "/CN=$recordingHost",
      "-addext", "subjectAltName=DNS:$recordingHost,IP:127.0.0.1"
    )
    $opensslProcess = Start-Process -FilePath $openssl `
      -ArgumentList $opensslArgs `
      -WindowStyle Hidden `
      -RedirectStandardOutput $opensslOut `
      -RedirectStandardError $opensslErr `
      -Wait `
      -PassThru
    if ($opensslProcess.ExitCode -ne 0) { throw "Could not create the recording TLS certificate." }
  }

  $certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath)
  $trusted = Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $certificate.Thumbprint } | Select-Object -First 1
  if (-not $trusted) {
    Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
  }
  Write-Host "[OK] trusted local TLS certificate"
}

function Ensure-Build {
  $needsBuild = $Rebuild -or -not (Test-Path (Join-Path $repo ".next\BUILD_ID"))
  if (-not $needsBuild -and (Test-Path -LiteralPath $buildMarker)) {
    $needsBuild = ((Get-Content -Raw -LiteralPath $buildMarker).Trim() -ne $sourceSha)
  } elseif (-not $needsBuild) {
    $needsBuild = $true
  }

  if ($needsBuild) {
    Write-Host "Building the local recording control app at $sourceSha ..."
    $env:WHITELABEL_SOURCE_SHA = $sourceSha
    $env:WHITELABEL_VERCEL_GIT_REPO_ID = "local-pilot-repository"
    $env:WHITELABEL_LOCAL_PILOT_ROOT = $root
    $env:WHITELABEL_LOCAL_PILOT_REGISTRY = $registryPath
    & node --env-file=.env.local scripts/whitelabel-local-demo-build.mjs
    if ($LASTEXITCODE -ne 0) { throw "Local recording build failed." }
    Set-Content -LiteralPath $buildMarker -Value $sourceSha -Encoding ASCII
    $script:recordingBuildRebuilt = $true
  }
  Write-Host "[OK] control build $sourceSha"
}

function Ensure-ControlRuntime {
  if ($script:recordingBuildRebuilt -and (Test-Port $controlPort)) {
    if (-not (Stop-StaleRecordingProcess $controlPort "control")) {
      throw "Port $controlPort is occupied by an unrelated process; cannot activate the rebuilt recording app."
    }
  }
  if (-not (Test-Url "http://127.0.0.1:$controlPort/auth/signin")) {
    if ((Test-Port $controlPort) -and -not (Stop-StaleRecordingProcess $controlPort "control")) {
      throw "Port $controlPort is occupied by an unrelated unhealthy process."
    }
    $env:WHITELABEL_SOURCE_SHA = $sourceSha
    $env:WHITELABEL_VERCEL_GIT_REPO_ID = "local-pilot-repository"
    $env:WHITELABEL_LOCAL_PILOT_ROOT = $root
    $env:WHITELABEL_LOCAL_PILOT_REGISTRY = $registryPath
    Start-HiddenNode @("--env-file=.env.local", "scripts/whitelabel-local-demo-start.mjs") "recording-control"
  }
  Wait-Url "Control UI :$controlPort" "http://127.0.0.1:$controlPort/auth/signin" 60
}

function Ensure-CustomerRuntime {
  if (-not (Test-Url "http://127.0.0.1:$customerPort/auth/signin")) {
    if ((Test-Port $customerPort) -and -not (Stop-StaleRecordingProcess $customerPort "customer")) {
      throw "Port $customerPort is occupied by an unrelated unhealthy process."
    }
    $env:WHITELABEL_LOCAL_PILOT_ROOT = $root
    $env:WHITELABEL_LOCAL_PILOT_REGISTRY = $registryPath
    Start-HiddenNode @("--env-file=.env.local", "scripts/whitelabel-local-pilot-serve.mjs", "b") "recording-customer"
  }
  Wait-Url "Customer runtime :$customerPort" "http://127.0.0.1:$customerPort/auth/signin" 60
}

function Ensure-HttpsProxy {
  if ($script:recordingBuildRebuilt -and (Test-Port $proxyPort)) {
    if (-not (Stop-StaleRecordingProcess $proxyPort "HTTPS proxy")) {
      throw "Port 443 is occupied by an unrelated process; cannot activate the recording HTTPS proxy."
    }
  }
  if (-not (Test-Url "https://$recordingHost/auth/signin")) {
    if ((Test-Port $proxyPort) -and -not (Stop-StaleRecordingProcess $proxyPort "HTTPS proxy")) {
      throw "Port 443 is occupied by an unrelated process, and https://$recordingHost is not healthy."
    }
    $env:WHITELABEL_LOCAL_PILOT_ROOT = $root
    $env:WHITELABEL_RECORDING_DOMAIN = $recordingHost
    $env:WHITELABEL_RECORDING_UPSTREAM_PORT = "$customerPort"
    Start-HiddenNode @("scripts/whitelabel-recording-proxy.mjs") "recording-proxy"
  }
  Wait-Url "Canonical HTTPS customer" "https://$recordingHost/auth/signin" 30
}

function Write-Preflight {
  $checks = [ordered]@{
    wslDocker = $true
    customerA = Test-Url "http://127.0.0.1:54421/auth/v1/health"
    customerB = Test-Url "http://127.0.0.1:54521/auth/v1/health"
    controlUi = Test-Url "http://127.0.0.1:$controlPort/auth/signin"
    customerRuntime = Test-Url "http://127.0.0.1:$customerPort/auth/signin"
    canonicalHttps = Test-Url "https://$recordingHost/auth/signin"
  }
  $ready = -not ($checks.Values -contains $false)
  [ordered]@{
    ready = $ready
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    sourceSha = $sourceSha
    domain = $recordingHost
    checks = $checks
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $preflightPath -Encoding UTF8
  if (-not $ready) { throw "Recording preflight did not pass every check." }
}

Set-Location $repo
$env:WHITELABEL_SOURCE_SHA = $sourceSha
$env:WHITELABEL_VERCEL_GIT_REPO_ID = "local-pilot-repository"
$env:WHITELABEL_LOCAL_PILOT = "1"
$env:WHITELABEL_LOCAL_PILOT_ALLOW_NEXT_START = "1"
$env:WHITELABEL_LOCAL_PILOT_ROOT = $root
$env:WHITELABEL_LOCAL_PILOT_REGISTRY = $registryPath

Ensure-WslDocker
Ensure-Supabase "customer-a" $customerAWorkdir "http://127.0.0.1:54421/auth/v1/health"
Ensure-Supabase "customer-b" $customerBWorkdir "http://127.0.0.1:54521/auth/v1/health"
Write-RecordingRegistry
Ensure-HostsEntry
Ensure-TlsCertificate
Ensure-Build
Ensure-ControlRuntime
Ensure-CustomerRuntime
Ensure-HttpsProxy
Write-Preflight

Write-Host ""
Write-Host "White Label recording preflight: READY"
Write-Host "Control:  http://127.0.0.1:$controlPort"
Write-Host "Customer: https://$recordingHost"
Write-Host "Source:   $sourceSha"
Write-Host ""
Write-Host "All local provider checks use fixtures/adapters; no cloud provider calls are required."

if ($CheckOnly) { exit 0 }
