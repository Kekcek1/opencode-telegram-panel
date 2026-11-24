@echo off
setlocal
cd /d "%~dp0"
if exist bot.pid (
  set /p PID=<bot.pid
  echo PID: %PID%
  tasklist /FI "PID eq %PID%"
) else (
  echo Bot is not running.
)
echo.
echo === last log ===
powershell -NoProfile -Command "if (Test-Path bot.log) { Get-Content bot.log -Tail 25 }"
