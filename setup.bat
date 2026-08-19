@echo off
title Gmail AI - Local Setup
cd /d "%~dp0"

echo.
echo ========================================
echo   College Project - Local Setup
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Install from https://nodejs.org then run this again.
  pause
  exit /b 1
)

echo [1/4] Backend folder...
cd backend
if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo Created backend\.env from example.
    echo IMPORTANT: Replace keys by copying a real .env from the configured PC.
  ) else (
    echo WARNING: No .env found. Copy backend\.env from the configured PC.
  )
) else (
  echo backend\.env already exists - OK
)

echo [2/4] Installing backend packages...
call npm install
if errorlevel 1 (
  echo Backend npm install failed.
  pause
  exit /b 1
)

echo [3/4] Installing frontend packages...
cd ..\frontend
call npm install
if errorlevel 1 (
  echo Frontend npm install failed.
  pause
  exit /b 1
)

cd ..
echo [4/4] Done.
echo.
echo ========================================
echo NEXT STEPS:
echo 1. Paste configured PC backend\.env into:
echo    %cd%\backend\.env
echo 2. Double-click START_BACKEND.bat
echo 3. Double-click START_FRONTEND.bat
echo 4. Open http://localhost:3000
echo 5. Open http://localhost:3000 and Register a new account
echo ========================================
echo.
pause
