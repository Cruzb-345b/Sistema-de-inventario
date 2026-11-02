@echo off
chcp 65001 >nul 2>&1
title Conectar Equipo a Neon - USB Hardware Resilient

echo.
echo  ======================================================
echo   INICIANDO CONECTOR USB DE TELEMETRÍA (WINDOWS)
echo  ======================================================
echo.

:: Ejecutar el script PowerShell incluido en la USB con permisos bypass
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\agent_windows.ps1"

echo.
echo Presiona cualquier tecla para salir...
pause >nul
