$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidPath = Join-Path $projectRoot '.data\processes.json'
if (-not (Test-Path -LiteralPath $pidPath)) { Write-Host 'No managed ProcureFlow processes are recorded.'; exit }
$processIds = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
function Stop-ProcureFlowTree([int]$targetId) {
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $targetId" -ErrorAction SilentlyContinue
    foreach ($child in $children) { Stop-ProcureFlowTree -targetId $child.ProcessId }
    Stop-Process -Id $targetId -ErrorAction SilentlyContinue
}
foreach ($processId in $processIds) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$processId)" -ErrorAction SilentlyContinue
    # A PID may have been reused. Match the actual application before stopping it.
    if ($process -and $process.CommandLine -and ($process.CommandLine -like '*uvicorn app.main:app*' -or $process.CommandLine -like '*procureflow*next*')) {
        Stop-ProcureFlowTree -targetId $processId
    }
}
Remove-Item -LiteralPath $pidPath
Write-Host 'Stopped the recorded ProcureFlow services.'
