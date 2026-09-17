param(
  [string]$HostName = "customer-a.local"
)

$ErrorActionPreference = "Stop"
$hostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"
$entry = "127.0.0.1 $HostName"
$content = Get-Content -LiteralPath $hostsPath -ErrorAction Stop
$pattern = "(?im)^\s*127\.0\.0\.1\s+" + [regex]::Escape($HostName) + "(?:\s|$)"

if (-not (($content -join "`n") -match $pattern)) {
  Add-Content -LiteralPath $hostsPath -Value $entry -Encoding ASCII
}

Clear-DnsClientCache | Out-Null

