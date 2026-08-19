@echo off
cd /d "%~dp0backend"
echo Starting backend on port 5000...
echo Keep this window OPEN.
echo Demo login: demo@college.com / demo123
npm run dev
pause
