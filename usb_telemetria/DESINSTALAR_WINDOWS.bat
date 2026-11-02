@echo off
chcp 65001 >nul 2>&1
title Desinstalar Agente de Telemetria - Windows

echo.
echo  ======================================================
echo   DESINSTALAR AGENTE DE TELEMETRÍA (WINDOWS)
echo  ======================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Write-Host '  [*] Deteniendo procesos en segundo plano...' -ForegroundColor Gray; ^
   Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*HardwareResilient*' } | Stop-Process -Force -ErrorAction SilentlyContinue; ^
   $startup = [Environment]::GetFolderPath('Startup'); ^
   $lnk = Join-Path $startup 'HardwareResilient.lnk'; ^
   if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host '  [OK] Acceso directo de inicio eliminado.' -ForegroundColor Green }; ^
   $dir = Join-Path $env:LOCALAPPDATA 'HardwareResilient'; ^
   if (Test-Path $dir) { Remove-Item $dir -Recurse -Force; Write-Host '  [OK] Archivos del agente eliminados.' -ForegroundColor Green }; ^
   Write-Host ''; ^
   Write-Host '  [LISTO] Telemetria desinstalada por completo de este equipo.' -ForegroundColor Cyan"

echo.
pause
