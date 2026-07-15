@echo off
echo Restarting InspireMe...

taskkill /FI "WINDOWTITLE eq InspireMe API*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq InspireMe Web*" /F >nul 2>&1
timeout /t 1 /nobreak >nul

start "InspireMe API" cmd /k "cd /d %~dp0apps\api && npm run dev"
timeout /t 2 /nobreak >nul
start "InspireMe Web" cmd /k "cd /d %~dp0apps\web && npm run dev"

echo Both services restarted.
