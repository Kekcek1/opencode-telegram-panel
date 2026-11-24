@echo off
setlocal
cd /d "%~dp0"
if exist bot.pid (
  set /p PID=<bot.pid
  taskkill /PID %PID% /F >nul 2>&1
  del bot.pid >nul 2>&1
)
"C:\Program Files\nodejs\node.exe" "%~dp0bot.mjs"
