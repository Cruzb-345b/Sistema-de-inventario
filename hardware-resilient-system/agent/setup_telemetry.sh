#!/usr/bin/env bash
# ============================================================
#  🖥️  HARDWARE RESILIENT — Setup de Telemetría
#  Registra este computador en el backend y lanza el agente.
#  Uso:  chmod +x setup_telemetry.sh && ./setup_telemetry.sh
# ============================================================

set -euo pipefail

# ── Colores ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

banner() {
  echo -e "${CYAN}"
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║   🖥️  HARDWARE RESILIENT — TELEMETRY AGENT SETUP   ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ── Configuración ────────────────────────────────────────────
# Conexión al servidor que almacena en Neon PostgreSQL
DEFAULT_BACKEND="http://192.168.100.36:3000"
if [ -n "${BACKEND_URL:-}" ]; then
  BASE_URL="${BACKEND_URL%/}"
elif [ -n "${BACKEND_IP:-}" ]; then
  BACKEND_PORT="${BACKEND_PORT:-3000}"
  BASE_URL="http://${BACKEND_IP}:${BACKEND_PORT}"
else
  BASE_URL="${DEFAULT_BACKEND}"
fi
INTERVAL="${AGENT_REPORT_INTERVAL_SECONDS:-5}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_SCRIPT="${SCRIPT_DIR}/agent.py"

# ── Funciones ────────────────────────────────────────────────
check_deps() {
  echo -e "${BOLD}[1/5] Verificando dependencias...${NC}"

  # Python3
  if ! command -v python3 &>/dev/null; then
    echo -e "${RED}✗ python3 no encontrado. Instálalo primero:${NC}"
    echo "  sudo apt install python3 python3-pip   # Debian/Ubuntu"
    echo "  sudo dnf install python3 python3-pip   # Fedora"
    echo "  brew install python3                   # macOS"
    exit 1
  fi
  echo -e "  ${GREEN}✓${NC} python3 $(python3 --version 2>&1 | awk '{print $2}')"

  # pip
  if ! python3 -m pip --version &>/dev/null; then
    echo -e "${RED}✗ pip no encontrado. Instálalo:${NC}"
    echo "  sudo apt install python3-pip"
    exit 1
  fi
  echo -e "  ${GREEN}✓${NC} pip disponible"

  # curl
  if ! command -v curl &>/dev/null; then
    echo -e "${RED}✗ curl no encontrado. Instálalo:${NC}"
    echo "  sudo apt install curl"
    exit 1
  fi
  echo -e "  ${GREEN}✓${NC} curl disponible"

  # Instalar psutil y requests
  echo ""
  echo -e "${BOLD}[2/5] Instalando paquetes Python (psutil, requests)...${NC}"
  python3 -m pip install --quiet --upgrade psutil requests 2>/dev/null || \
  python3 -m pip install --quiet --upgrade --user psutil requests
  echo -e "  ${GREEN}✓${NC} psutil y requests instalados"
}

check_backend() {
  echo ""
  echo -e "${BOLD}[3/5] Verificando conexión al backend (${BASE_URL})...${NC}"
  if curl -sf "${BASE_URL}/api/health" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Backend accesible en ${BASE_URL}"
  else
    echo -e "${RED}✗ No se puede conectar al backend en ${BASE_URL}${NC}"
    echo ""
    echo -e "  Posibles soluciones:"
    echo -e "  1. ¿El backend está corriendo? → ${CYAN}cd backend && npm run dev${NC}"
    echo -e "  2. ¿IP incorrecta? → ${CYAN}BACKEND_IP=192.168.1.100 ./setup_telemetry.sh${NC}"
    echo -e "  3. ¿Firewall? → ${CYAN}sudo ufw allow ${BACKEND_PORT}/tcp${NC}"
    exit 1
  fi
}

collect_info() {
  echo ""
  echo -e "${BOLD}[4/5] Información del computador a registrar${NC}"
  echo -e "${YELLOW}  (Presiona Enter para usar el valor por defecto)${NC}"
  echo ""

  # Auto-detectar valores
  DEFAULT_HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
  DEFAULT_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "0.0.0.0")
  DEFAULT_MAC=$(ip link show 2>/dev/null | awk '/ether/{print toupper($2); exit}' || echo "00:00:00:00:00:00")
  DEFAULT_SERIAL="${DEFAULT_HOSTNAME}-$(date +%s | tail -c 7)"
  DEFAULT_MODEL=$(cat /sys/devices/virtual/dmi/id/product_name 2>/dev/null || echo "Linux Workstation")

  # Preguntar
  read -rp "  Número de serie [${DEFAULT_SERIAL}]: " SERIAL
  SERIAL="${SERIAL:-$DEFAULT_SERIAL}"

  read -rp "  Nombre del equipo [${DEFAULT_HOSTNAME}]: " DEVICE_NAME
  DEVICE_NAME="${DEVICE_NAME:-$DEFAULT_HOSTNAME}"

  read -rp "  Modelo [${DEFAULT_MODEL}]: " MODEL
  MODEL="${MODEL:-$DEFAULT_MODEL}"

  read -rp "  Dirección IP [${DEFAULT_IP}]: " IP_ADDR
  IP_ADDR="${IP_ADDR:-$DEFAULT_IP}"

  read -rp "  Dirección MAC [${DEFAULT_MAC}]: " MAC_ADDR
  MAC_ADDR="${MAC_ADDR:-$DEFAULT_MAC}"

  read -rp "  Ubicación [Oficina Principal]: " LOCATION
  LOCATION="${LOCATION:-Oficina Principal}"

  echo ""
  echo -e "${CYAN}  ┌─────────────────────────────────────────┐${NC}"
  echo -e "${CYAN}  │  Resumen del dispositivo                │${NC}"
  echo -e "${CYAN}  ├─────────────────────────────────────────┤${NC}"
  printf  "${CYAN}  │${NC}  %-14s %s\n" "Serial:" "$SERIAL"
  printf  "${CYAN}  │${NC}  %-14s %s\n" "Nombre:" "$DEVICE_NAME"
  printf  "${CYAN}  │${NC}  %-14s %s\n" "Modelo:" "$MODEL"
  printf  "${CYAN}  │${NC}  %-14s %s\n" "IP:" "$IP_ADDR"
  printf  "${CYAN}  │${NC}  %-14s %s\n" "MAC:" "$MAC_ADDR"
  printf  "${CYAN}  │${NC}  %-14s %s\n" "Ubicación:" "$LOCATION"
  printf  "${CYAN}  │${NC}  %-14s %s\n" "Backend:" "$BASE_URL"
  echo -e "${CYAN}  └─────────────────────────────────────────┘${NC}"
  echo ""

  read -rp "  ¿Registrar y comenzar telemetría? [S/n]: " CONFIRM
  CONFIRM="${CONFIRM:-S}"
  if [[ ! "$CONFIRM" =~ ^[SsYy]$ ]]; then
    echo -e "${YELLOW}Cancelado por el usuario.${NC}"
    exit 0
  fi
}

register_device() {
  echo ""
  echo -e "${BOLD}[5/5] Registrando dispositivo en el backend...${NC}"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/devices" \
    -H "Content-Type: application/json" \
    -d "{
      \"serialNumber\": \"${SERIAL}\",
      \"name\": \"${DEVICE_NAME}\",
      \"model\": \"${MODEL}\",
      \"ipAddress\": \"${IP_ADDR}\",
      \"macAddress\": \"${MAC_ADDR}\",
      \"location\": \"${LOCATION}\",
      \"status\": \"ONLINE\"
    }")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [[ "$HTTP_CODE" == "201" ]]; then
    DEVICE_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
    echo -e "  ${GREEN}✓${NC} Dispositivo registrado exitosamente (ID: ${DEVICE_ID})"
  elif [[ "$HTTP_CODE" == "409" ]] || echo "$BODY" | grep -qi "unique\|duplicate\|already"; then
    echo -e "  ${YELLOW}⚠${NC} El dispositivo ya existe. Continuando con telemetría..."
  else
    echo -e "  ${RED}✗${NC} Error al registrar (HTTP ${HTTP_CODE}):"
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
    echo ""
    read -rp "  ¿Continuar de todas formas con el agente? [S/n]: " CONT
    CONT="${CONT:-S}"
    if [[ ! "$CONT" =~ ^[SsYy]$ ]]; then
      exit 1
    fi
  fi
}

start_agent() {
  TELEMETRY_URL="${BASE_URL}/api/devices/${SERIAL}/telemetry"

  echo ""
  echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  🚀 Iniciando agente de telemetría...${NC}"
  echo -e "${GREEN}  Endpoint: ${TELEMETRY_URL}${NC}"
  echo -e "${GREEN}  Intervalo: cada ${INTERVAL}s${NC}"
  echo -e "${GREEN}  Detener: Ctrl+C${NC}"
  echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
  echo ""

  # Verificar que agent.py existe
  if [[ ! -f "$AGENT_SCRIPT" ]]; then
    echo -e "${RED}✗ No se encontró agent.py en ${AGENT_SCRIPT}${NC}"
    echo -e "  Descarga el archivo agent.py y colócalo junto a este script."
    exit 1
  fi

  # Lanzar agente
  export AGENT_DEVICE_ID="$SERIAL"
  export BACKEND_TELEMETRY_URL="$TELEMETRY_URL"
  export AGENT_REPORT_INTERVAL_SECONDS="$INTERVAL"

  exec python3 "$AGENT_SCRIPT"
}

# ── Main ─────────────────────────────────────────────────────
banner
check_deps
check_backend
collect_info
register_device
start_agent
