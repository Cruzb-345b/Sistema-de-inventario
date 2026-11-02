-- ========================================================
-- Script de inicialización de Base de Datos para el Sistema de Inventario
-- Motor: MySQL 8+ / MariaDB 10.5+
-- ========================================================

-- 1. Crear la base de datos (con soporte completo UTF-8)
CREATE DATABASE IF NOT EXISTS `inventory_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 2. Crear usuario dedicado para el sistema (opcional pero recomendado para producción)
-- Modifica 'inventory_pass' por la contraseña que desees
CREATE USER IF NOT EXISTS 'inventory_user'@'localhost' IDENTIFIED BY 'inventory_pass';
CREATE USER IF NOT EXISTS 'inventory_user'@'%' IDENTIFIED BY 'inventory_pass';

-- 3. Otorgar permisos completos sobre la base de datos
GRANT ALL PRIVILEGES ON `inventory_db`.* TO 'inventory_user'@'localhost';
GRANT ALL PRIVILEGES ON `inventory_db`.* TO 'inventory_user'@'%';
FLUSH PRIVILEGES;

USE `inventory_db`;

-- 4. Estructura de tablas (creadas automáticamente por Prisma, o manualmente a continuación):

CREATE TABLE IF NOT EXISTS `Device` (
  `id` VARCHAR(191) NOT NULL,
  `serialNumber` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `model` VARCHAR(191) NOT NULL,
  `ipAddress` VARCHAR(191) NOT NULL,
  `macAddress` VARCHAR(191) NOT NULL,
  `location` VARCHAR(191) NOT NULL,
  `status` ENUM('ONLINE', 'OFFLINE', 'DEGRADED', 'MAINTENANCE') NOT NULL DEFAULT 'OFFLINE',
  `lastHeartbeat` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Device_serialNumber_key` (`serialNumber`),
  INDEX `Device_status_idx` (`status`),
  INDEX `Device_serialNumber_idx` (`serialNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TelemetryLog` (
  `id` VARCHAR(191) NOT NULL,
  `deviceId` VARCHAR(191) NOT NULL,
  `cpuUsage` DOUBLE NOT NULL,
  `ramUsage` DOUBLE NOT NULL,
  `diskUsage` DOUBLE NOT NULL,
  `uptimeSeconds` DOUBLE NOT NULL DEFAULT 0.0,
  `temperature` DOUBLE NULL,
  `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `TelemetryLog_deviceId_recordedAt_idx` (`deviceId`, `recordedAt`),
  CONSTRAINT `TelemetryLog_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Datos iniciales de prueba (Seed):
INSERT INTO `Device` (`id`, `serialNumber`, `name`, `model`, `ipAddress`, `macAddress`, `location`, `status`, `lastHeartbeat`, `createdAt`, `updatedAt`)
VALUES
  ('dev-001', 'SRV-RACK-089A', 'Core Edge Router 01', 'Dell PowerEdge R640', '192.168.10.15', '00:1A:2B:3C:4D:01', 'Datacenter A - Rack 04', 'ONLINE', NOW(), NOW(), NOW()),
  ('dev-002', 'SRV-STOR-112B', 'Distributed Storage Node', 'HP ProLiant DL380 Gen10', '192.168.10.16', '00:1A:2B:3C:4D:02', 'Datacenter A - Rack 05', 'DEGRADED', NOW(), NOW(), NOW()),
  ('dev-003', 'SRV-GATE-994C', 'Industrial Gateway Alpha', 'Advantech UNO-2484G', '192.168.20.5', '00:1A:2B:3C:4D:03', 'Plant Substation 2', 'MAINTENANCE', NOW(), NOW(), NOW()),
  ('dev-004', 'SRV-SNSR-440D', 'Telemetry Aggregator Hub', 'Supermicro SuperServer', '192.168.10.22', '00:1A:2B:3C:4D:04', 'Datacenter B - Rack 01', 'ONLINE', NOW(), NOW(), NOW())
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

INSERT INTO `TelemetryLog` (`id`, `deviceId`, `cpuUsage`, `ramUsage`, `diskUsage`, `uptimeSeconds`, `temperature`, `recordedAt`)
VALUES
  (UUID(), 'dev-001', 34.2, 58.7, 41.5, 846200, 42.5, NOW()),
  (UUID(), 'dev-002', 94.6, 91.2, 89.4, 1420500, 68.0, NOW()),
  (UUID(), 'dev-003', 0.0, 0.0, 22.0, 0, 24.0, NOW()),
  (UUID(), 'dev-004', 18.5, 42.1, 35.8, 294000, 38.2, NOW());
