@echo off
cd /d "%~dp0backend"
echo Starting backend on port 5000...
echo Keep this window OPEN.
npm run dev
pause
