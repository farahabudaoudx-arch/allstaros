param(
  [switch]$Rebuild,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$supabaseWorkdir = "/mnt/e/LocalPilot/whitelabel-customer-a"
$supabaseCli = "~/.local/bin/supabase-2.117.0"
$apiUrl = "http://127.0.0.1:54421"
$appUrl = "http://127.0.0.1:3201"
$loginUrl = "$appUrl/auth/dev?key=local-demo-only"

Set-Location $repo

function Test-Url([string]$Url) {
  try {
    $null = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Url "$apiUrl/rest/v1/")) {
  Write-Host "Starting WSL Docker keepalive..."
  $keepAliveCommand = "sudo -n systemctl start docker; while true; do sleep 3600; done"
  Start-Process -FilePath "wsl.exe" `
    -ArgumentList @("-d", "Ubuntu-22.04", "--", "bash", "-lc", $keepAliveCommand) `
    -WindowStyle Hidden | Out-Null

  $dockerReady = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    & wsl.exe -d Ubuntu-22.04 -- docker info *> $null
    if ($LASTEXITCODE -eq 0) {
      $dockerReady = $true
      break
    }
  }
  if (-not $dockerReady) {
    throw "Docker inside Ubuntu-22.04 did not become ready."
  }

  Write-Host "Starting Customer A Supabase..."
  & wsl.exe -d Ubuntu-22.04 -- bash -lc "$supabaseCli status --workdir $supabaseWorkdir >/dev/null 2>&1 || $supabaseCli start --workdir $supabaseWorkdir"

  $apiReady = $false
  for ($i = 0; $i -lt 60; $i++) {
    if (Test-Url "$apiUrl/rest/v1/") {
      $apiReady = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $apiReady) {
    throw "Local Supabase did not become reachable at $apiUrl."
  }
}

Write-Host "Supabase OK: $apiUrl"
Write-Host "Studio:      http://127.0.0.1:54423"
Write-Host "Mailpit:     http://127.0.0.1:54424"

if ($Rebuild -or -not (Test-Path (Join-Path $repo ".next\BUILD_ID"))) {
  Write-Host "Building local production demo..."
  & node --env-file=.env.local scripts/whitelabel-local-demo-build.mjs
  if ($LASTEXITCODE -ne 0) { throw "Local demo build failed." }
}

if ($CheckOnly) {
  Write-Host "Environment is ready."
  exit 0
}

Write-Host ""
Write-Host "App:          $appUrl"
Write-Host "Role switch:  $loginUrl"
Write-Host ""
Write-Host "Press Ctrl+C to stop the Next.js app."
Write-Host "When you are completely done, run: wsl --shutdown"

& node --env-file=.env.local scripts/whitelabel-local-demo-start.mjs
