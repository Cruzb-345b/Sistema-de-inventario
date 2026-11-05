# 🖥️ Hardware Resilient System — Sistema de Inventario y Telemetría en Vivo

[![Neon PostgreSQL](https://img.shields.io/badge/Database-Neon%20PostgreSQL%20Serverless-00E599?style=flat-square&logo=postgresql)](https://neon.tech)
[![React 19](https://img.shields.io/badge/Frontend-React%2019%20+%20Vite-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%205-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Python Telemetry](https://img.shields.io/badge/Agent-Python%203%20+%20PowerShell-3776AB?style=flat-square&logo=python)](https://python.org)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-222222?style=flat-square&logo=github)](https://cruzb-345b.github.io/Sistema-de-inventario/)

Sistema integral de grado industrial para la supervisión, inventario y monitoreo de hardware en tiempo real con tolerancia a fallos. Diseñado con arquitectura resiliente, persistencia en la nube sobre **Neon PostgreSQL Serverless**, soporte de despliegue estático en **GitHub Pages** y un **Kit USB Plug-and-Play** para conectar computadores sin instalar dependencias previas.

---

## 🌐 Enlaces del Proyecto

- **Dashboard en Vivo (GitHub Pages):** [https://cruzb-345b.github.io/Sistema-de-inventario/](https://cruzb-345b.github.io/Sistema-de-inventario/)
- **Acceso en Red Local (Wi-Fi / LAN):** `http://192.168.100.36:3000`
- **Health Check del Servidor:** `http://192.168.100.36:3000/api/health`

---

## 🏗️ Arquitectura del Sistema

```mermaid
graph TD
    subgraph "Nodos Cliente / Hardware"
        A[PC Windows<br/>PowerShell Agent USB] -->|HTTP POST :3000| B(Reverse Proxy Vite /api)
        C[PC Linux / Mac<br/>Bash /proc Agent USB] -->|HTTP POST :3000| B
        D[Daemon Python<br/>agent.py psutil] -->|HTTP POST :3000| B
    end

    subgraph "Servidor Local / LAN"
        B --> E[Backend Express.js<br/>Port 4000]
        E -->|Prisma ORM + SSL Pooler| F[(Neon PostgreSQL Cloud<br/>AWS sa-east-1)]
    end

    subgraph "Nube & Visualización"
        F <--->|SQL over HTTPS<br/>@neondatabase/serverless| G[GitHub Pages<br/>React 19 Dashboard]
        E <--->|REST API / Live Feed| H[Dashboard Local<br/>http://localhost:3000]
    end
```

---

## ✨ Características Principales

### 1. 📡 Telemetría Real en Vivo
- **Métricas precisas:** Medición en tiempo real de uso de CPU (%), Memoria RAM (%), Disco duro (%), Tiempo de actividad (Uptime) y Temperatura aproximada.
- **Visualizador Osciloscopio:** Gráfica interactiva de formas de onda en tiempo real para inspeccionar estabilidad térmica y carga de trabajo de cada nodo.
- **Sin datos simulados:** Todo dispositivo y lectura proviene de máquinas reales conectadas a la base de datos de Neon.

### 2. ☁️ Persistencia 100% en Neon PostgreSQL
- Todas las computadoras (`Device`) y lecturas de telemetría (`TelemetryLog`) se guardan de forma permanente e histórica en el clúster serverless de Neon en AWS (`sa-east-1`).
- Soporte dual: acceso mediante **Prisma ORM** en el backend y mediante el driver serverless **`@neondatabase/serverless`** (SQL-sobre-HTTPS) directo desde GitHub Pages.

### 3. 💾 Kit USB "Cero Dependencias" (`usb_telemetria/`)
Permite conectar cualquier computador nuevo o formateado simplemente conectando una memoria USB:
- **Windows (7 / 10 / 11):** Doble clic en `CONECTAR_WINDOWS.bat`. Utiliza el PowerShell nativo de Windows (sin requerir Python, ni permisos de Administrador).
- **Linux / macOS:** Ejecución de `./CONECTAR_LINUX.sh` mediante lectura directa del pseudo-sistema de archivos del kernel (`/proc/stat` y `/proc/meminfo`).
- **Modos de ejecución:**
  - **Permanente 24/7:** Instala un servicio silencioso en segundo plano que arranca con el sistema, permitiendo retirar la memoria USB de inmediato.
  - **Temporal:** Monitorea en vivo en la ventana de terminal únicamente mientras la USB está conectada.
  - **Desinstalador incluido:** `DESINSTALAR_WINDOWS.bat` para remover el servicio en 1 clic.

### 4. 🛡️ Resiliencia y Seguridad
- **Protección contra Inyección en Hojas de Cálculo (CSV Formula Injection):** Sanitización automática de prefijos peligrosos (`=`, `+`, `-`, `@`, `\t`, `\r`) en importación y exportación de CSV.
- **Validación Estricta:** Esquemas Zod para la integridad de datos de hardware (Serial, MAC, IP, Modelo, Ubicación).
- **Backoff Exponencial Progresivo:** Los agentes de telemetría reintentan automáticamente con pausas exponenciales (hasta 60s) ante cortes de red sin colapsar el sistema.

---

## 📁 Estructura del Repositorio

```text
Sistema-de-inventario/
├── src/                                  # Código fuente Frontend (React 19 + TypeScript)
│   ├── components/
│   │   ├── DeviceDashboard.tsx           # Dashboard principal de hardware y telemetría
│   │   ├── AuthPortal.tsx                # Portal de acceso y gestión de usuarios
│   │   └── ErrorBoundary.tsx             # Manejo de fallos con degradación elegante
│   ├── lib/
│   │   ├── api.ts                        # Cliente unificado (Proxy local + Neon Serverless)
│   │   └── auth.ts                       # Neon Auth y autenticación por credenciales
│   ├── App.tsx                           # Enrutador y vista central
│   └── main.tsx                          # Punto de entrada Vite
├── hardware-resilient-system/
│   ├── backend/                          # Backend Express + Prisma ORM
│   │   ├── prisma/
│   │   │   └── schema.prisma             # Modelo de datos (Device y TelemetryLog)
│   │   └── src/                          # Controladores, rutas y middlewares
│   ├── agent/                            # Agente de telemetría avanzado en Python
│   │   ├── agent.py                      # Daemon de telemetría con psutil y aislamiento
│   │   ├── setup_telemetry.sh            # Asistente de instalación para Linux
│   │   └── setup_telemetry.bat           # Asistente de instalación para Windows
│   └── usb_telemetria/                   # 💾 Kit USB portátil (cero dependencias)
│       ├── CONECTAR_WINDOWS.bat          # Conector 1-clic para Windows
│       ├── DESINSTALAR_WINDOWS.bat       # Desinstalador 1-clic para Windows
│       ├── CONECTAR_LINUX.sh             # Conector para Linux
│       ├── config.ini                    # Configuración de IP / Servidor destino
│       ├── LEEME.txt                     # Instrucciones de uso rápido
│       └── scripts/                      # Motores nativos (PowerShell y Bash /proc)
├── verify_neon.mjs                       # Script de auditoría de la base de datos Neon
├── vite.config.ts                        # Configuración de Vite con Proxy inverso a :4000
└── package.json                          # Scripts y dependencias del proyecto
```

---

## 🚀 Puesta en Marcha Local

### Prerrequisitos
- **Node.js** >= 18.x
- **npm** o **pnpm**
- **Python 3** (opcional, solo para el agente Python)

### 1. Clonar e Instalar Dependencias
```bash
git clone https://github.com/Cruzb-345b/Sistema-de-inventario.git
cd Sistema-de-inventario
npm install
npm --prefix hardware-resilient-system/backend install
```

### 2. Configurar Variables de Entorno (`.env`)
El archivo `.env` en la raíz contiene las credenciales de conexión al clúster de Neon:
```env
DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xyz-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://neondb_owner:PASSWORD@ep-xyz.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require"
NEON_BRANCH=production
```

### 3. Iniciar el Clúster
Abre dos terminales:

**Terminal 1 — Backend (Neon + Express):**
```bash
npm run dev:backend
```
*(Inicia en el puerto 4000 con conexión directa a Neon).*

**Terminal 2 — Frontend (Vite):**
```bash
npm run dev
```
*(Inicia en `http://localhost:3000` con proxy automático a la API).*

---

## 🛠️ Scripts Útiles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el frontend Vite en `http://0.0.0.0:3000`. |
| `npm run dev:backend` | Inicia el backend Node.js en el puerto 4000 conectado a Neon. |
| `npm run db:verify` | **Audita en vivo** la base de datos de Neon: muestra nodos registrados y últimas lecturas. |
| `npm run build` | Compila el bundle de producción para distribución web. |
| `npm run deploy` | Compila y publica automáticamente la versión actualizada en **GitHub Pages**. |

---

## 💾 Guía de Uso del Kit USB

Para conectar computadores externos sin instalar repositorios ni librerías:

1. Copia todo el contenido de la carpeta `usb_telemetria/` a la raíz de una memoria USB.
2. Si el computador destino está en la misma red Wi-Fi/LAN, el archivo `config.ini` ya apunta a `http://192.168.100.36:3000`. Si vas a transmitir por Internet, cámbialo por tu dominio o túnel HTTPS.
3. Conecta la USB en el computador destino:
   - **En Windows:** Doble clic en `CONECTAR_WINDOWS.bat`. Selecciona opción `1` (Permanente) y retira la USB.
   - **En Linux:** Ejecuta `./CONECTAR_LINUX.sh` desde la terminal.
4. El equipo aparecerá de inmediato en el Dashboard web transmitiendo telemetría en tiempo real.

---

## 👥 Roles de Usuario y Acceso

El sistema cuenta con control de acceso basado en roles (RBAC) autenticado mediante **Neon Auth**:

| Rol | Permisos |
| :--- | :--- |
| **ADMIN** | Registro, edición, eliminación de nodos, pruebas de estrés y auditoría completa. |
| **OPERATOR** | Supervisión en vivo, ping ICMP, filtrado e importación/exportación de CSV. |
| **AUDITOR** | Vista de solo lectura para inspección de métricas históricas de SLA. |

---

## 📄 Licencia

Este proyecto fue desarrollado bajo arquitectura resiliente para supervisión de infraestructura crítica. Código abierto para fines académicos y operativos.