@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 goto run
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.12 or newer, then try again.
  pause
  exit /b 1
)
:run
node start.cjs
pause
