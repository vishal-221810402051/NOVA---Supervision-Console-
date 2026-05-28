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
} | Where-Object { $_.State -eq "LISTENING" -or $_.State -eq "ESTABLISHED" }

if (-not $connections) {
  Write-Host "No TCP connections found on local port $port."
  exit 0
}

$pids = $connections |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Where-Object { $_ -and $_ -ne 0 }

foreach ($processId in $pids) {
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
  $processFallback = Get-Process -Id $processId -ErrorAction SilentlyContinue
  $states = ($connections | Where-Object { $_.OwningProcess -eq $processId } | Select-Object -ExpandProperty State -Unique) -join ","
  $isExpectedVenv = $false
  $name = $processInfo.Name
  $executablePath = $processInfo.ExecutablePath
  $commandLine = $processInfo.CommandLine

  if (-not $name -and $processFallback) {
    $name = $processFallback.ProcessName
  }

  if (-not $executablePath -and $processFallback) {
    $executablePath = $processFallback.Path
  }

  if ($executablePath) {
    $normalizedPath = $executablePath.ToLowerInvariant()
    $isExpectedVenv = $normalizedPath.EndsWith("\nova-sc\backend\.venv\scripts\python.exe")
  }

  Write-Host "PID: $processId"
  Write-Host "States: $states"
  Write-Host "Process: $name"
  Write-Host "ExecutablePath: $executablePath"
  Write-Host "CommandLine: $commandLine"
  Write-Host "Expected backend venv: $isExpectedVenv"
  Write-Host ""
}
