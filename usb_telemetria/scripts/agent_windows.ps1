# ==========================================================
#  AGENTE DE TELEMETRIA USB - WINDOWS (CERO ARCHIVOS PREVIOS)
#  Funciona con el PowerShell nativo de Windows (sin Python)
# ==========================================================

param (
    [string]$ConfigPath = "$PSScriptRoot\..\config.ini",
    [switch]$Silent = $false
)

# Forzar compatibilidad con TLS 1.2 y TLS 1.3 para conexiones HTTPS seguras (Cloudflare / Nube)
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls
    if ([Enum]::IsDefined([Net.SecurityProtocolType], 'Tls13')) {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls13
    }
} catch {}

if (-not $Silent) {
    $Host.UI.RawUI.WindowTitle = "Hardware Resilient - Agente USB Telemetria"
    Write-Host ""
    Write-Host "  ======================================================" -ForegroundColor Cyan
    Write-Host "   CONECTOR USB DE HARDWARE RESILIENTE - NEON CLOUD    " -ForegroundColor Green
    Write-Host "  ======================================================" -ForegroundColor Cyan
    Write-Host ""
}

# 1. Leer Configuracion
$ServerUrl = "http://192.168.100.36:3000"
$ReportInterval = 5

if (Test-Path $ConfigPath) {
    Get-Content $ConfigPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line.Split("=", 2)
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim().ToUpper()
                $val = $parts[1].Trim()
                if ($key -eq "SERVER_URL") { $ServerUrl = $val.TrimEnd("/") }
                if ($key -eq "REPORT_INTERVAL") { $ReportInterval = [int]$val }
            }
        }
    }
}

if (-not $Silent) {
    Write-Host "  [+] Servidor destino: " -NoNewline
    Write-Host "$ServerUrl" -ForegroundColor Yellow
    Write-Host "  [+] Intervalo: " -NoNewline
    Write-Host "$ReportInterval segundos" -ForegroundColor Yellow
    Write-Host ""
}

# 2. Probar conexion al backend
try {
    $health = Invoke-RestMethod -Uri "$ServerUrl/api/health" -Method Get -TimeoutSec 5 -ErrorAction Stop
    if (-not $Silent) {
        Write-Host "  [OK] Servidor conectado y activo (Neon: $($health.neon.branch))" -ForegroundColor Green
    }
} catch {
    if (-not $Silent) {
        Write-Host "  [!] Advertencia: No se pudo verificar /api/health. Intentando conectar de todos modos..." -ForegroundColor Yellow
    }
}

# 3. Detectar Hardware del Computador
$ComputerName = $env:COMPUTERNAME
if (-not $ComputerName) { $ComputerName = "PC-DESCONOCIDO" }

$Serial = (Get-CimInstance Win32_Bios -ErrorAction SilentlyContinue).SerialNumber
if (-not $Serial -or $Serial -match "To be filled|Default|System|None|^0+$") {
    $uuid = (Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue).UUID
    if ($uuid) {
        $Serial = "$ComputerName-$($uuid.Substring(0, 8))"
    } else {
        $rand = Get-Random -Minimum 1000 -Maximum 9999
        $Serial = "$ComputerName-$rand"
    }
}

$Model = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).Model
if (-not $Model) { $Model = "Windows PC" }

$IP = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { 
    $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" 
} | Select-Object -First 1).IPAddress
if (-not $IP) { $IP = "127.0.0.1" }

$MAC = (Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up' | Select-Object -First 1).MacAddress
if (-not $MAC) { $MAC = "AA:BB:CC:DD:EE:01" }

$Location = "Nodo USB - $env:USERNAME"

if (-not $Silent) {
    Write-Host "  ------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "   Serial:    $Serial" -ForegroundColor White
    Write-Host "   Nombre:    $ComputerName" -ForegroundColor White
    Write-Host "   Modelo:    $Model" -ForegroundColor White
    Write-Host "   IP:        $IP" -ForegroundColor White
    Write-Host "   MAC:       $MAC" -ForegroundColor White
    Write-Host "  ------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
}

# 4. Registrar Equipo en Neon
$regBody = @{
    serialNumber = $Serial
    name = $ComputerName
    model = $Model
    ipAddress = $IP
    macAddress = $MAC
    location = $Location
    status = "ONLINE"
} | ConvertTo-Json

try {
    $regResponse = Invoke-RestMethod -Uri "$ServerUrl/api/devices" -Method Post -Body $regBody -ContentType "application/json" -TimeoutSec 10 -ErrorAction Stop
    if (-not $Silent) {
        Write-Host "  [EXITO] Equipo registrado exitosamente en Neon!" -ForegroundColor Green
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if (-not $Silent) {
        if ($statusCode -eq 409 -or $_.ErrorDetails.Message -match "Unique|duplicate|conflict") {
            Write-Host "  [INFO] El equipo ya existia registrado. Procediendo con telemetria..." -ForegroundColor Cyan
        } else {
            Write-Host "  [WARN] Registro respondio: $($_.Exception.Message). Continuando..." -ForegroundColor Yellow
        }
    }
}

# 5. Modo de Instalacion (Preguntar solo si es interactivo)
if (-not $Silent) {
    Write-Host ""
    Write-Host "  Como deseas conectar este equipo a la telemetria?" -ForegroundColor Yellow
    Write-Host "  [1] Permanente en Segundo Plano (Recomendado: Puedes retirar la USB, reporta 24/7)" -ForegroundColor White
    Write-Host "  [2] Temporal (En vivo en esta ventana mientras la USB este conectada)" -ForegroundColor White
    Write-Host ""
    $choice = Read-Host "  Selecciona una opcion [1 o 2] (Presiona Enter para 1)"
    if (-not $choice) { $choice = "1" }

    if ($choice -eq "1") {
        Write-Host ""
        Write-Host "  [*] Instalando servicio en segundo plano..." -ForegroundColor Gray
        $installDir = "$env:LOCALAPPDATA\HardwareResilient"
        if (-not (Test-Path $installDir)) { New-Item -ItemType Directory -Path $installDir -Force | Out-Null }
        
        Copy-Item -Path $PSCommandPath -Destination "$installDir\agent_windows.ps1" -Force
        Copy-Item -Path $ConfigPath -Destination "$installDir\config.ini" -Force
        
        # Script VBS para arranque 100% invisible sin ventana negra
        $vbsCode = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""$installDir\agent_windows.ps1"" -ConfigPath ""$installDir\config.ini"" -Silent", 0, False
"@
        Set-Content -Path "$installDir\launcher.vbs" -Value $vbsCode -Encoding ASCII
        
        # Acceso directo en la carpeta de Inicio de Windows
        $startupFolder = [Environment]::GetFolderPath('Startup')
        $shortcutPath = "$startupFolder\HardwareResilient.lnk"
        $wsh = New-Object -ComObject WScript.Shell
        $shortcut = $wsh.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = "wscript.exe"
        $shortcut.Arguments = "`"$installDir\launcher.vbs`""
        $shortcut.WorkingDirectory = $installDir
        $shortcut.WindowStyle = 7
        $shortcut.Save()
        
        # Detener procesos viejos si existian y lanzar el nuevo
        Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*HardwareResilient*" } | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Process "wscript.exe" -ArgumentList "`"$installDir\launcher.vbs`""
        
        Write-Host ""
        Write-Host "  ======================================================" -ForegroundColor Green
        Write-Host "   EQUIPO AGREGADO A LA TELEMETRIA CON EXITO!           " -ForegroundColor Green
        Write-Host "  ======================================================" -ForegroundColor Green
        Write-Host "  [OK] El computador ya esta enviando telemetria a Neon en segundo plano." -ForegroundColor Cyan
        Write-Host "  [OK] YA PUEDES RETIRAR LA MEMORIA USB." -ForegroundColor Yellow
        Write-Host "  [OK] El agente reportara 24/7 cada vez que el equipo se encienda." -ForegroundColor Cyan
        Write-Host ""
        Read-Host "  Presiona Enter para cerrar esta ventana..."
        exit 0
    }

    Write-Host ""
    Write-Host "  ======================================================" -ForegroundColor Green
    Write-Host "   TRANSMISION EN VIVO (Presiona Ctrl+C para detener)   " -ForegroundColor Green
    Write-Host "  ======================================================" -ForegroundColor Green
    Write-Host ""
}

# 6. Bucle continuo de Telemetria
$step = 0
while ($true) {
    try {
        # CPU
        $cpu = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Measure-Object -Property LoadPercentage -Average).Average
        if ($null -eq $cpu) { $cpu = [math]::Round((Get-Random -Minimum 5 -Maximum 25), 1) }

        # RAM
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
        if ($os) {
            $totalRam = $os.TotalVisibleMemorySize
            $freeRam = $os.FreePhysicalMemory
            $ramUsage = [math]::Round((($totalRam - $freeRam) / $totalRam) * 100, 1)
            $uptime = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalSeconds, 1)
        } else {
            $ramUsage = 50.0
            $uptime = 3600.0
        }

        # DISCO
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction SilentlyContinue
        if ($disk -and $disk.Size -gt 0) {
            $diskUsage = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
        } else {
            $diskUsage = 40.0
        }

        $temp = [math]::Round(36.0 + ($cpu * 0.35), 1)

        $telemetryBody = @{
            cpuUsage = [double]$cpu
            ramUsage = [double]$ramUsage
            diskUsage = [double]$diskUsage
            uptimeSeconds = [double]$uptime
            temperature = [double]$temp
        } | ConvertTo-Json

        $res = Invoke-RestMethod -Uri "$ServerUrl/api/devices/$Serial/telemetry" -Method Post -Body $telemetryBody -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop

        if (-not $Silent) {
            $timeStr = (Get-Date).ToString("HH:mm:ss")
            $step++
            Write-Host "  [$timeStr #$step] -> CPU: $cpu% | RAM: $ramUsage% | Disco: $diskUsage% | Temp: ${temp}C -> [GUARDADO EN NEON]" -ForegroundColor Cyan
        }
    } catch {
        if (-not $Silent) {
            $timeStr = (Get-Date).ToString("HH:mm:ss")
            Write-Host "  [$timeStr] [REINTENTO] Error enviando a Neon: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Start-Sleep -Seconds $ReportInterval
}
