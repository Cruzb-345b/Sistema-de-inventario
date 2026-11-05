#!/usr/bin/env bash
# ==========================================================
#  INICIADOR DE SERVIDOR CON TÚNEL PÚBLICO (CLOUDFLARE)
#  Permite recibir telemetría desde cualquier PC en el mundo
# ==========================================================

set -e
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "=========================================================="
echo " 🌐 INICIANDO SISTEMA DE INVENTARIO PARA CUALQUIER RED"
echo "=========================================================="

# 1. Asegurar binario de cloudflared
if ! command -v cloudflared &> /dev/null; then
    if [ -f "$HOME/.local/bin/cloudflared" ]; then
        export PATH="$HOME/.local/bin:$PATH"
    else
        echo "[*] Descargando Cloudflared..."
        mkdir -p "$HOME/.local/bin"
        curl -sSL -o "$HOME/.local/bin/cloudflared" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
        chmod +x "$HOME/.local/bin/cloudflared"
        export PATH="$HOME/.local/bin:$PATH"
    fi
fi

# 2. Iniciar servidor local si no está activo
if ! curl -s http://localhost:3000/api/health &> /dev/null; then
    echo "[*] Iniciando servidor local en segundo plano (puerto 3000)..."
    PORT=3000 npx tsx server.ts > /tmp/inventory_server.log 2>&1 &
    sleep 3
fi

# 3. Iniciar el túnel de Cloudflare y capturar la URL
echo "[*] Estableciendo túnel seguro en la nube..."
CLOUDFLARE_LOG="/tmp/cloudflared_$$.log"
cloudflared tunnel --url http://localhost:3000 > "$CLOUDFLARE_LOG" 2>&1 &
TUNNEL_PID=$!

# Esperar a que se genere la URL pública
TUNNEL_URL=""
for i in {1..30}; do
    if grep -q "trycloudflare.com" "$CLOUDFLARE_LOG" 2>/dev/null; then
        TUNNEL_URL=$(grep -o 'https://[-a-zA-Z0-9.]*\.trycloudflare\.com' "$CLOUDFLARE_LOG" | head -n 1)
        break
    fi
    sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
    echo "[!] Error al obtener la URL del túnel. Revisa $CLOUDFLARE_LOG"
    exit 1
fi

# 4. Actualizar automáticamente config.ini en usb_telemetria
CONFIG_FILE="$PROJECT_DIR/usb_telemetria/config.ini"
if [ -f "$CONFIG_FILE" ]; then
    sed -i "s|^SERVER_URL=.*|SERVER_URL=$TUNNEL_URL|" "$CONFIG_FILE"
    echo "[OK] config.ini actualizado con la nueva URL pública."
fi

echo ""
echo "=========================================================="
echo " 🎉 ¡LISTO! TU SERVIDOR YA ES ACCESIBLE DESDE CUALQUIER RED"
echo "=========================================================="
echo " 🔗 URL pública del servidor: $TUNNEL_URL"
echo " 📡 Health check:            $TUNNEL_URL/api/health"
echo " 💾 Archivo de configuración: $CONFIG_FILE"
echo ""
echo " 👉 Ahora simplemente conecta tu memoria USB en cualquier"
echo "    computadora con Windows (con internet) y ejecuta:"
echo "    CONECTAR_WINDOWS.bat"
echo "=========================================================="
echo "Presiona Ctrl + C para detener el túnel cuando termines."

# Mantener en ejecución
trap "kill $TUNNEL_PID 2>/dev/null || true; exit" SIGINT SIGTERM
wait $TUNNEL_PID

