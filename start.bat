@echo off
cd /d "%~dp0"
set NODE_EXTRA_CA_CERTS=%~dp0certs\local-ca.pem

if not exist "client\dist\index.html" (
  echo Building the app for first use, please wait...
  call npm run build
  if errorlevel 1 (
    echo Build failed - see the errors above.
    pause
    exit /b 1
  )
)

powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient).Connect('localhost',3001); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% == 0 (
  echo Investment Tracker is already running - opening your browser.
  start "" http://localhost:3001
  exit /b 0
)

echo Starting Investment Tracker...
start "Investment Tracker - Server (keep this window open)" cmd /k node server\index.js

echo Waiting for the server to come up...
powershell -NoProfile -Command "$ok=$false; for ($i=0; $i -lt 30; $i++) { try { (New-Object Net.Sockets.TcpClient).Connect('localhost',3001); $ok=$true; break } catch { Start-Sleep -Milliseconds 500 } }; if (-not $ok) { Write-Host 'Server did not respond within 15 seconds - check the other window for errors.'; exit 1 }"
if errorlevel 1 (
  echo.
  echo The server window is still open - check it for the actual error.
  pause
  exit /b 1
)

echo Server is up - opening http://localhost:3001
start "" http://localhost:3001
