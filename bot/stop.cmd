@echo off
setlocal
cd /d "%~dp0"
if not exist bot.pid (
  echo Bot is not running.
  exit /b 0
)
set /p PID=<bot.pid
taskkill /PID %PID% /F
del bot.pid >nul 2>&1
