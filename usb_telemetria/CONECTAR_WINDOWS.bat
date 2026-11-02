@echo off
setlocal
title Hardware Resilient - Telemetria Neon

echo.
echo ======================================================
echo  INICIANDO CONECTOR USB DE TELEMETRIA (WINDOWS)
echo ======================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\agent_windows.ps1"

echo.
echo Presiona cualquier tecla para salir...
pause >nul
