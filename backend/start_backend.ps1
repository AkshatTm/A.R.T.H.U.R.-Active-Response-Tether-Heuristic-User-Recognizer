# SentryOS Backend — Windows PowerShell launcher
# ------------------------------------------------
# Run this script instead of `python main.py` to avoid the spurious
# NativeCommandError that PowerShell emits when a native process writes
# to stderr (uvicorn logs its startup banner to stderr, which PowerShell
# incorrectly treats as an error stream).
#
# Usage:
#   cd backend
#   .\start_backend.ps1
#
# Ctrl+C gracefully shuts down uvicorn via its own SIGINT handler,
# which in turn triggers the FastAPI lifespan cleanup (stops the vision
# thread and BLE tether).

$ErrorActionPreference = 'Continue'   # don't abort on stderr output

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "Starting SentryOS backend on http://0.0.0.0:8000 ..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop.`n" -ForegroundColor DarkGray

# Run python and pipe stderr to stdout so PowerShell doesn't treat it
# as NativeCommandError.  The 2>&1 redirect is done at the cmd.exe
# level via Start-Process so PowerShell never sees the raw stderr stream.
$proc = Start-Process `
    -FilePath "python" `
    -ArgumentList "main.py" `
    -NoNewWindow `
    -PassThru `
    -Wait

exit $proc.ExitCode
