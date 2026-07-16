Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Start-AdminSession {
  if (Test-IsAdministrator) {
    return
  }

  Write-Host "Requesting administrator permissions..."
  $argList = @(
    '-NoProfile'
    '-ExecutionPolicy', 'Bypass'
    '-File', ('"{0}"' -f $PSCommandPath)
  )
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList
  exit 0
}

function Get-CaddyPath {
  $caddyCommand = Get-Command caddy -ErrorAction SilentlyContinue
  if ($caddyCommand -and $caddyCommand.Source) {
    return $caddyCommand.Source
  }

  $candidatePaths = @(
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\caddy.exe'),
    'C:\Program Files\Caddy\caddy.exe',
    'C:\Program Files (x86)\Caddy\caddy.exe'
  )

  foreach ($candidate in $candidatePaths) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

function Install-Caddy {
  $existing = Get-CaddyPath
  if ($existing) {
    return $existing
  }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is not available. Install Caddy manually from https://caddyserver.com/download"
  }

  Write-Host "Installing Caddy via winget..."
  winget install --id CaddyServer.Caddy -e --accept-package-agreements --accept-source-agreements | Out-Host

  $after = Get-CaddyPath
  if (-not $after) {
    throw "Caddy installation completed but caddy executable was not found. Restart PowerShell and try again, or install Caddy manually."
  }

  return $after
}

function Get-NssmExecutablePath {
  $nssmCommand = Get-Command nssm -ErrorAction SilentlyContinue
  if ($nssmCommand -and $nssmCommand.Source) {
    return $nssmCommand.Source
  }

  $candidatePaths = @(
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\nssm.exe'),
    'C:\Program Files\NSSM\nssm.exe',
    'C:\Program Files\NSSM\win64\nssm.exe',
    'C:\Program Files (x86)\NSSM\nssm.exe',
    'C:\Program Files (x86)\NSSM\win32\nssm.exe'
  )

  foreach ($candidate in $candidatePaths) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

function Install-NssmIfMissing {
  $existing = Get-NssmExecutablePath
  if ($existing) {
    return $existing
  }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is not available. Install NSSM manually from https://nssm.cc/download"
  }

  Write-Host "Installing NSSM via winget..."
  winget install --id NSSM.NSSM -e --accept-package-agreements --accept-source-agreements | Out-Host

  $after = Get-NssmExecutablePath
  if (-not $after) {
    throw "NSSM installation completed but nssm.exe was not found. Restart PowerShell and try again, or install NSSM manually."
  }

  return $after
}

function Get-InviteConfigPaths {
  $appData = $env:APPDATA
  $programData = $env:ProgramData
  return @(
    (Join-Path $programData 'LetsMakeHistory\invite-settings.json'),
    (Join-Path $appData 'Let''s Make History\invite-settings.json'),
    (Join-Path $appData 'lmhistory-app\invite-settings.json')
  )
}

function Write-InviteConfigFiles([string]$publicBaseUrl, [int]$publicPort) {
  $configObject = [ordered]@{
    publicBaseUrl = $publicBaseUrl
    autoDetectPublicIp = $false
    publicPort = $publicPort
  }

  $json = $configObject | ConvertTo-Json -Depth 5
  $paths = Get-InviteConfigPaths

  foreach ($configPath in $paths) {
    $parentDir = Split-Path $configPath
    New-Item -ItemType Directory -Force -Path $parentDir | Out-Null
    Set-Content -Path $configPath -Value $json -Encoding UTF8
  }

  return $paths
}

function Get-PublicIp {
  try {
    $resp = Invoke-RestMethod -Uri 'https://api.ipify.org?format=json' -TimeoutSec 8
    if ($resp -and $resp.ip) {
      return [string]$resp.ip
    }
  } catch {
    return $null
  }
  return $null
}

function Read-RequiredInput([string]$message, [string]$defaultValue = '') {
  while ($true) {
    $prompt = if ($defaultValue) { "$message [$defaultValue]" } else { $message }
    $value = Read-Host $prompt
    if (-not $value -and $defaultValue) {
      return $defaultValue
    }
    if ($value -and $value.Trim()) {
      return $value.Trim()
    }
  }
}

Start-AdminSession

Write-Host ""
Write-Host "=== Let's Make History - Caddy Self-Host Setup ==="
Write-Host ""

$caddyExe = Install-Caddy
$nssmExe = Install-NssmIfMissing
$publicIp = Get-PublicIp

if ($publicIp) {
  Write-Host "Detected public IP: $publicIp"
} else {
  Write-Host "Could not detect public IP automatically."
}

Write-Host ""
Write-Host "Choose internet host mode:"
Write-Host "  1) Domain (recommended, trusted HTTPS certificates)"
Write-Host "  2) Public IP (free, but HTTP only / no trusted TLS)"
$mode = Read-RequiredInput "Enter 1 or 2" "1"

while ($mode -ne '1' -and $mode -ne '2') {
  $mode = Read-RequiredInput "Enter 1 or 2" "1"
}

$localPortInput = Read-Host "Local app port [3000]"
$localPort = if ($localPortInput) { [int]$localPortInput } else { 3000 }
if ($localPort -lt 1 -or $localPort -gt 65535) {
  throw "Local app port must be between 1 and 65535."
}

$targetHost = ''
$internetBaseUrl = ''
$publicPort = 443

if ($mode -eq '1') {
  $targetHost = Read-RequiredInput "Enter domain (example: game.example.com)"
  $email = Read-Host "Email for certificate notices (optional)"
  $publicPort = 443

  $globalBlock = if ($email) {
@"
{
  email $email
}

"@
  } else {
    ''
  }

  $caddyBody = @"
${globalBlock}$targetHost {
  encode zstd gzip

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "no-referrer"
  }

  request_body {
    max_size 2MB
  }

  reverse_proxy 127.0.0.1:$localPort
}
"@

  $internetBaseUrl = "https://$targetHost"
} else {
  $defaultIp = if ($publicIp) { $publicIp } else { '' }
  $targetHost = Read-RequiredInput "Enter public IP to share with players" $defaultIp
  $publicPortInput = Read-Host "Public listening port [8025]"
  $publicPort = if ($publicPortInput) { [int]$publicPortInput } else { 8025 }
  if ($publicPort -lt 1 -or $publicPort -gt 65535) {
    throw "Public listening port must be between 1 and 65535."
  }

  $caddyBody = @"
http://$($targetHost):$publicPort {
  encode zstd gzip

  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "no-referrer"
  }

  request_body {
    max_size 2MB
  }

  reverse_proxy 127.0.0.1:$localPort
}
"@

  $internetBaseUrl = "http://$targetHost`:$publicPort"
}

$inviteConfigPaths = Write-InviteConfigFiles -publicBaseUrl $internetBaseUrl -publicPort $publicPort

$configDir = Join-Path $env:ProgramData 'LetsMakeHistory\caddy'
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$configPath = Join-Path $configDir 'Caddyfile'

Set-Content -Path $configPath -Value $caddyBody -Encoding UTF8

Write-Host "Validating Caddy configuration..."
& $caddyExe validate --config $configPath --adapter caddyfile | Out-Host

$existingService = Get-Service -Name caddy -ErrorAction SilentlyContinue
if ($existingService) {
  Write-Host "Refreshing existing Caddy service..."
  & $nssmExe stop caddy | Out-Host
  & $nssmExe remove caddy confirm | Out-Host
}

Write-Host "Installing Caddy as a Windows service..."
& $nssmExe install caddy $caddyExe | Out-Host
& $nssmExe set caddy AppDirectory $configDir | Out-Host
& $nssmExe set caddy AppParameters "run --config `"$configPath`" --adapter caddyfile" | Out-Host
& $nssmExe set caddy AppStdout (Join-Path $configDir 'caddy-stdout.log') | Out-Host
& $nssmExe set caddy AppStderr (Join-Path $configDir 'caddy-stderr.log') | Out-Host
& $nssmExe set caddy AppNoConsole 1 | Out-Host
& $nssmExe start caddy | Out-Host

$serviceStatus = (Get-Service -Name caddy -ErrorAction SilentlyContinue)
if (-not $serviceStatus -or $serviceStatus.Status -ne 'Running') {
  throw "Caddy service failed to start. Check Windows Event Viewer and Caddy logs."
}

$settingsHint = @"
Open Let's Make History tray menu and choose:
  Open Invite Settings File
Then set:
  publicBaseUrl = \"$internetBaseUrl\"
  autoDetectPublicIp = false
  publicPort = $publicPort
Restart the app and use Copy Player Link (Internet).

Invite settings written to:
$(($inviteConfigPaths -join "`n"))
"@

Write-Host ""
Write-Host "Caddy service is running."
Write-Host "Caddyfile: $configPath"
Write-Host "Invite URL base: $internetBaseUrl"
if ($mode -eq '1') {
  Write-Host "Forward router ports 80 and 443 to this machine."
} else {
  Write-Host "WARNING: Public IP mode uses HTTP and is not encrypted."
  Write-Host "Forward router port $localPort to this machine."
}
Write-Host ""
Write-Host $settingsHint
