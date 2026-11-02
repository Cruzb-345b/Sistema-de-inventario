@echo off
chcp 65001 >nul 2>&1
title Hardware Resilient - Telemetry Agent Setup

:: ============================================================
::  HARDWARE RESILIENT — Setup de Telemetría (Windows)
::  Registra este computador en el backend y lanza el agente.
::  Uso: Doble clic o ejecutar desde CMD
:: ============================================================

echo.
echo   ╔══════════════════════════════════════════════════════╗
echo   ║   HARDWARE RESILIENT — TELEMETRY AGENT SETUP        ║
echo   ╚══════════════════════════════════════════════════════╝
echo.

:: ── CONFIGURACIÓN ──────────────────────────────────────────
:: Conexión al servidor que almacena en Neon PostgreSQL
if "%BACKEND_URL%"=="" (
    if "%BACKEND_IP%"=="" set BACKEND_IP=192.168.100.36
    if "%BACKEND_PORT%"=="" set BACKEND_PORT=3000
    set BASE_URL=http://%BACKEND_IP%:%BACKEND_PORT%
) else (
    set BASE_URL=%BACKEND_URL%
)
set INTERVAL=5

:: ── [1/5] Verificar Python ─────────────────────────────────
echo [1/5] Verificando dependencias...

python --version >nul 2>&1
if errorlevel 1 (
    python3 --version >nul 2>&1
    if errorlevel 1 (
        echo   X Python no encontrado!
        echo   Descargalo de https://www.python.org/downloads/
        echo   Marca "Add Python to PATH" al instalar.
        pause
        exit /b 1
    )
    set PYTHON=python3
) else (
    set PYTHON=python
)
echo   OK Python encontrado

:: ── [2/5] Instalar paquetes ────────────────────────────────
echo.
echo [2/5] Instalando paquetes Python...
%PYTHON% -m pip install --quiet --upgrade psutil requests
echo   OK psutil y requests instalados

:: ── [3/5] Verificar backend ────────────────────────────────
echo.
echo [3/5] Verificando conexion al backend (%BASE_URL%)...
curl -sf %BASE_URL%/api/health >nul 2>&1
if errorlevel 1 (
    echo   X No se puede conectar al backend en %BASE_URL%
    echo.
    echo   Posibles soluciones:
    echo   1. El backend esta corriendo?
    echo   2. IP incorrecta? Ejecuta: set BACKEND_IP=192.168.1.100
    echo   3. Firewall bloqueando puerto %BACKEND_PORT%?
    pause
    exit /b 1
)
echo   OK Backend accesible

:: ── [4/5] Recopilar información ────────────────────────────
echo.
echo [4/5] Informacion del computador a registrar
echo   (Presiona Enter para usar el valor por defecto)
echo.

:: Auto-detectar hostname
for /f "tokens=*" %%H in ('hostname') do set DEFAULT_HOSTNAME=%%H

set /p SERIAL="  Numero de serie [%DEFAULT_HOSTNAME%-PC]: "
if "%SERIAL%"=="" set SERIAL=%DEFAULT_HOSTNAME%-PC

set /p DEVICE_NAME="  Nombre del equipo [%DEFAULT_HOSTNAME%]: "
if "%DEVICE_NAME%"=="" set DEVICE_NAME=%DEFAULT_HOSTNAME%

set /p MODEL="  Modelo [Windows Workstation]: "
if "%MODEL%"=="" set MODEL=Windows Workstation

set /p IP_ADDR="  Direccion IP [0.0.0.0]: "
if "%IP_ADDR%"=="" set IP_ADDR=0.0.0.0

set /p MAC_ADDR="  Direccion MAC [00:00:00:00:00:00]: "
if "%MAC_ADDR%"=="" set MAC_ADDR=00:00:00:00:00:00

set /p LOCATION="  Ubicacion [Oficina Principal]: "
if "%LOCATION%"=="" set LOCATION=Oficina Principal

echo.
echo   ┌─────────────────────────────────────────┐
echo   │  Resumen del dispositivo                │
echo   ├─────────────────────────────────────────┤
echo   │  Serial:    %SERIAL%
echo   │  Nombre:    %DEVICE_NAME%
echo   │  Modelo:    %MODEL%
echo   │  IP:        %IP_ADDR%
echo   │  MAC:       %MAC_ADDR%
echo   │  Ubicacion: %LOCATION%
echo   │  Backend:   %BASE_URL%
echo   └─────────────────────────────────────────┘
echo.

set /p CONFIRM="  Registrar y comenzar telemetria? [S/n]: "
if "%CONFIRM%"=="" set CONFIRM=S
if /i not "%CONFIRM%"=="S" if /i not "%CONFIRM%"=="Y" (
    echo Cancelado.
    pause
    exit /b 0
)

:: ── [5/5] Registrar y lanzar ───────────────────────────────
echo.
echo [5/5] Registrando dispositivo en el backend...

curl -s -X POST %BASE_URL%/api/devices ^
  -H "Content-Type: application/json" ^
  -d "{\"serialNumber\":\"%SERIAL%\",\"name\":\"%DEVICE_NAME%\",\"model\":\"%MODEL%\",\"ipAddress\":\"%IP_ADDR%\",\"macAddress\":\"%MAC_ADDR%\",\"location\":\"%LOCATION%\",\"status\":\"ONLINE\"}"

echo.
echo   OK Dispositivo registrado

echo.
echo ==================================================
echo   Iniciando agente de telemetria...
echo   Endpoint: %BASE_URL%/api/devices/%SERIAL%/telemetry
echo   Intervalo: cada %INTERVAL%s
echo   Detener: Ctrl+C
echo ==================================================
echo.

set AGENT_DEVICE_ID=%SERIAL%
set BACKEND_TELEMETRY_URL=%BASE_URL%/api/devices/%SERIAL%/telemetry
set AGENT_REPORT_INTERVAL_SECONDS=%INTERVAL%

%PYTHON% "%~dp0agent.py"

pause
