@echo off
cd /d "%~dp0frontend"
echo Starting frontend on port 3000...
echo Keep this window OPEN.
echo Then open: http://localhost:3000
npm start
pause
