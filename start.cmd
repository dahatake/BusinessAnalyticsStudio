@echo off
rem FR-141 launcher for Windows. Real work is in start.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
exit /b %ERRORLEVEL%
