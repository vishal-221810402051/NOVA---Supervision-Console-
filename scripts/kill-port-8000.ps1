$ErrorActionPreference = "Stop"

$port = 8000
$connections = netstat -ano | Select-String ":$port" | ForEach-Object {
  $parts = ($_ -replace "^\s+", "") -split "\s+"
  if ($parts.Length -ge 5 -and $parts[0] -eq "TCP") {
    [pscustomobject]@{
      Protocol = $parts[0]
      LocalAddress = $parts[1]
      ForeignAddress = $parts[2]
      State = $parts[3]
      OwningProcess = [int]$parts[4]
    }
  }
} | Where-Object { $_.State -eq "LISTENING" }

if (-not $connections) {
  Write-Host "No LISTENING process found on local port $port."
  exit 0
}

$pids = $connections |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Where-Object { $_ -and $_ -ne 0 }

foreach ($processId in $pids) {
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
  $processFallback = Get-Process -Id $processId -ErrorAction SilentlyContinue

  if (-not $processInfo -and -not $processFallback) {
    Write-Host "PID $processId is listed by netstat but process lookup failed."
    Write-Host "Attempting taskkill fallback..."
    taskkill /PID $processId /F
    Write-Host ""
    continue
  }

  $name = $processInfo.Name
  $commandLine = $processInfo.CommandLine
  $executablePath = $processInfo.ExecutablePath

  if (-not $name -and $processFallback) {
    $name = $processFallback.ProcessName
  }

  if (-not $executablePath -and $processFallback) {
    $executablePath = $processFallback.Path
  }
  $looksLikeBackend =
    $name -match "python|uvicorn" -or
    $commandLine -match "uvicorn|main:app|backend" -or
    (-not $name -and -not $executablePath -and -not $commandLine)

  Write-Host "Candidate listener on port $port"
  Write-Host "PID: $processId"
  Write-Host "Process: $name"
  Write-Host "ExecutablePath: $executablePath"
  Write-Host "CommandLine: $commandLine"

  if (-not $looksLikeBackend) {
    Write-Host "Skipping PID $processId because it does not look like a backend/server process."
    Write-Host ""
    continue
  }

  Write-Host "Stopping PID $processId..."
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Write-Host ""
}

$remaining = netstat -ano | Select-String ":$port" | ForEach-Object {
  $parts = ($_ -replace "^\s+", "") -split "\s+"
  if ($parts.Length -ge 5 -and $parts[0] -eq "TCP") {
    [pscustomobject]@{
      LocalAddress = $parts[1]
      LocalPort = $port
      State = $parts[3]
      OwningProcess = [int]$parts[4]
    }
  }
} | Where-Object { $_.State -eq "LISTENING" }

if ($remaining) {
  Write-Host "Port $port still has LISTENING entries:"
  $remaining | Format-Table -AutoSize LocalAddress,LocalPort,State,OwningProcess
  Write-Host "If the PID cannot be inspected or killed, re-run this script from an elevated PowerShell terminal."
  exit 1
}

Write-Host "No LISTENING process remains on local port $port."
