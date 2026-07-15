@echo off
echo Starting InspireMe...

start "InspireMe API" cmd /k "cd /d %~dp0apps\api && npm run dev"
timeout /t 2 /nobreak >nul
start "InspireMe Web" cmd /k "cd /d %~dp0apps\web && npm run dev"

echo Both services started.
