@echo off
title Gmail AI - Start Backend + Frontend
cd /d "%~dp0"

echo Starting BACKEND (port 5000) in a new window...
start "Gmail AI Backend" cmd /k "cd /d %~dp0backend && npm run dev"

echo Waiting 8 seconds for backend to be ready...
timeout /t 8 /nobreak >nul

echo Starting FRONTEND (port 3000)...
start "Gmail AI Frontend" cmd /k "cd /d %~dp0frontend && npm start"

echo.
echo Open http://localhost:3000 when both windows show "ready".
echo Backend MUST be running before you click Sign in with Google.
pause
