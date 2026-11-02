#!/usr/bin/env bash
# ==========================================================
#  AGENTE DE TELEMETRÍA USB — LINUX (CERO DEPENDENCIAS)
#  Usa únicamente Bash nativo y /proc (sin necesidad de Python)
# ==========================================================

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../config.ini"

# Colores de consola
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
GRAY='\033[0;90m'
NC='\033[0m'

echo -e "\n${CYAN}  ======================================================${NC}"
echo -e "${GREEN}   CONECTOR USB DE HARDWARE RESILIENTE — NEON CLOUD    ${NC}"
echo -e "${CYAN}  ======================================================${NC}\n"

# 1. Cargar Configuración
SERVER_URL="http://192.168.100.36:3000"
REPORT_INTERVAL=5

if [ -f "$CONFIG_FILE" ]; then
  while IFS='=' read -r key val || [ -n "$key" ]; do
    key=$(echo "$key" | tr -d ' \r\t' | tr '[:lower:]' '[:upper:]')
    val=$(echo "$val" | tr -d ' \r\t')
    if [[ "$key" =~ ^#.* ]] || [ -z "$key" ]; then continue; fi
    if [ "$key" = "SERVER_URL" ]; then SERVER_URL="${val%/}"; fi
    if [ "$key" = "REPORT_INTERVAL" ]; then REPORT_INTERVAL="$val"; fi
  done < "$CONFIG_FILE"
fi

echo -e "  [+] Servidor destino: ${YELLOW}${SERVER_URL}${NC}"
echo -e "  [+] Intervalo: ${YELLOW}${REPORT_INTERVAL} segundos${NC}\n"

# 2. Probar conectividad
echo -e "  ${GRAY}[*] Verificando conexión al servidor...${NC}"
if curl -sf --max-time 4 "${SERVER_URL}/api/health" >/dev/null 2>&1; then
  echo -e "  ${GREEN}[OK] Servidor conectado y respondiendo!${NC}"
else
  echo -e "  ${YELLOW}[!] Advertencia: Servidor no respondió a health probe. Reintentando de todos modos...${NC}"
fi

# 3. Detectar Hardware de este equipo
echo -e "\n  ${GRAY}[*] Detectando hardware de este equipo...${NC}"

HOSTNAME=$(hostname 2>/dev/null || echo "Linux-Node")
SERIAL=$(cat /sys/class/dmi/id/product_serial 2>/dev/null || true)
if [ -z "$SERIAL" ] || [ "$SERIAL" = "None" ] || [ "$SERIAL" = "Default string" ]; then
  UUID=$(cat /sys/class/dmi/id/product_uuid 2>/dev/null || true)
  if [ -n "$UUID" ]; then
    SERIAL="${HOSTNAME}-${UUID:0:8}"
  else
    SERIAL="${HOSTNAME}-$((1000 + RANDOM % 9000))"
  fi
fi

MODEL=$(cat /sys/class/dmi/id/product_name 2>/dev/null || echo "Linux Workstation")
IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}')
IP_ADDR="${IP_ADDR:-127.0.0.1}"
MAC_ADDR=$(ip link 2>/dev/null | awk '/ether/{print toupper($2); exit}')
MAC_ADDR="${MAC_ADDR:-00:1A:2B:3C:4D:5E}"

echo -e "  ${GRAY}------------------------------------------------------${NC}"
echo -e "   Serial:    ${SERIAL}"
echo -e "   Nombre:    ${HOSTNAME}"
echo -e "   Modelo:    ${MODEL}"
echo -e "   IP:        ${IP_ADDR}"
echo -e "   MAC:       ${MAC_ADDR}"
echo -e "  ${GRAY}------------------------------------------------------${NC}\n"

# 4. Registrar en Neon
echo -e "  ${GRAY}[*] Registrando equipo en Neon PostgreSQL...${NC}"
REGISTER_PAYLOAD=$(cat <<EOF
{
  "serialNumber": "${SERIAL}",
  "name": "${HOSTNAME}",
  "model": "${MODEL}",
  "ipAddress": "${IP_ADDR}",
  "macAddress": "${MAC_ADDR}",
  "location": "Nodo USB - $(whoami)",
  "status": "ONLINE"
}
EOF
)

REG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${SERVER_URL}/api/devices" \
  -H "Content-Type: application/json" \
  -d "$REGISTER_PAYLOAD" || echo "000")

if [ "$REG_STATUS" = "201" ]; then
  echo -e "  ${GREEN}[ÉXITO] Equipo registrado exitosamente en Neon!${NC}"
elif [ "$REG_STATUS" = "409" ]; then
  echo -e "  ${CYAN}[INFO] El equipo ya estaba registrado en Neon. Continuando con telemetría...${NC}"
else
  echo -e "  ${YELLOW}[INFO] Respuesta de registro (${REG_STATUS}). Continuando con telemetría...${NC}"
fi

echo -e "\n${GREEN}  ======================================================${NC}"
echo -e "${GREEN}   TRANSMISIÓN DE TELEMETRÍA EN VIVO INICIADA            ${NC}"
echo -e "${GRAY}   (Presiona Ctrl+C para detener el agente)              ${NC}"
echo -e "${GREEN}  ======================================================${NC}\n"

# 5. Bucle de Telemetría cada REPORT_INTERVAL segundos
count=0
while true; do
  # Medir CPU leyendo /proc/stat
  read -r _ a1 b1 c1 idle1 _ < /proc/stat 2>/dev/null || { a1=0; b1=0; c1=0; idle1=100; }
  total1=$((a1 + b1 + c1 + idle1))
  sleep 0.4
  read -r _ a2 b2 c2 idle2 _ < /proc/stat 2>/dev/null || { a2=0; b2=0; c2=0; idle2=100; }
  total2=$((a2 + b2 + c2 + idle2))
  diff_total=$((total2 - total1))
  diff_idle=$((idle2 - idle1))
  if [ "$diff_total" -gt 0 ]; then
    cpu_usage=$(( (1000 * (diff_total - diff_idle) / diff_total + 5) / 10 ))
  else
    cpu_usage=5
  fi

  # Medir RAM leyendo /proc/meminfo
  mem_total=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 1)
  mem_avail=$(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null || echo 1)
  if [ "$mem_total" -gt 0 ]; then
    ram_usage=$(( 100 - (100 * mem_avail / mem_total) ))
  else
    ram_usage=50
  fi

  # Medir Disco
  disk_usage=$(df -k / 2>/dev/null | awk 'NR==2 {print $5}' | tr -d '%' || echo 40)
  disk_usage="${disk_usage:-40}"

  # Uptime
  uptime_sec=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 3600)

  # Temperatura aproximada
  temp=$(( 36 + (cpu_usage * 35 / 100) ))

  # Payload JSON
  PAYLOAD="{\"cpuUsage\":$cpu_usage,\"ramUsage\":$ram_usage,\"diskUsage\":$disk_usage,\"uptimeSeconds\":$uptime_sec,\"temperature\":$temp}"

  # Enviar al servidor
  HTTP_RES=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 -X POST "${SERVER_URL}/api/devices/${SERIAL}/telemetry" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" || echo "000")

  count=$((count + 1))
  now=$(date +"%H:%M:%S")

  if [ "$HTTP_RES" = "201" ] || [ "$HTTP_RES" = "200" ]; then
    echo -e "  [${now} #${count}] -> CPU: ${cpu_usage}% | RAM: ${ram_usage}% | Disco: ${disk_usage}% | Temp: ${temp}°C -> ${GREEN}[GUARDADO EN NEON]${NC}"
  else
    echo -e "  [${now} #${count}] -> CPU: ${cpu_usage}% | RAM: ${ram_usage}% -> ${RED}[ERROR HTTP $HTTP_RES]${NC}"
  fi

  # Esperar el resto del intervalo
  sleep_time=$((REPORT_INTERVAL > 1 ? REPORT_INTERVAL - 1 : 1))
  sleep "$sleep_time"
done
