#!/usr/bin/env bash
# ==========================================================
#  Lanzador USB para Linux — Cero Archivos Previos
#  Uso: Doble clic o ejecutar: ./CONECTAR_LINUX.sh
# ==========================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "${DIR}/scripts/agent_linux.sh"
exec "${DIR}/scripts/agent_linux.sh"
