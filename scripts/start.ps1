param([switch]$Install)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$backendPath = Join-Path $projectRoot 'backend'
$frontendPath = Join-Path $projectRoot 'frontend'
$logPath = Join-Path $projectRoot '.data'
New-Item -ItemType Directory -Force -Path $logPath | Out-Null
if ($Install -or -not (Test-Path -LiteralPath $pythonPath)) {
    if (-not (Test-Path -LiteralPath $pythonPath)) { & python -m venv (Join-Path $projectRoot '.venv') }
    & $pythonPath -m pip install -r (Join-Path $backendPath 'requirements.lock.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
    Push-Location $frontendPath
    try { & npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' } } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) { Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination (Join-Path $projectRoot '.env') }
$processIds = @()
$backendPort = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
$frontendPort = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue
if ($backendPort -or $frontendPort) { throw 'Ports 8000 or 3000 are already in use. Stop the existing ProcureFlow instance before launching another.' }
$backend = Start-Process -FilePath $pythonPath -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $backendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath 'backend.log') -RedirectStandardError (Join-Path $logPath 'backend.error.log') -PassThru
$processIds += $backend.Id
$nextScript = Join-Path $frontendPath 'node_modules\next\dist\bin\next'
$quotedNextScript = '"' + $nextScript + '"'
try {
    $frontend = Start-Process -FilePath $nodePath -ArgumentList @($quotedNextScript, 'dev', '--hostname', '127.0.0.1', '--port', '3000') -WorkingDirectory $frontendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath 'frontend.log') -RedirectStandardError (Join-Path $logPath 'frontend.error.log') -PassThru
    $processIds += $frontend.Id
    @($processIds) | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logPath 'processes.json')
    $ready = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
            $web = Invoke-WebRequest 'http://127.0.0.1:3000' -TimeoutSec 2
            if ($health.status -eq 'ok' -and $web.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw 'Startup did not finish. Inspect .data logs.' }
    Write-Host "ProcureFlow is ready: http://127.0.0.1:3000 ($($health.agent_mode) mode)"
    Write-Host 'API documentation: http://127.0.0.1:8000/docs'
    Write-Host 'Stop with: .\scripts\stop.ps1'
} catch {
    foreach ($processId in $processIds) { Stop-Process -Id $processId -ErrorAction SilentlyContinue }
    throw
}
