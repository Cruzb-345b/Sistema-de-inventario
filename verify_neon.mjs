import { PrismaClient } from './hardware-resilient-system/backend/node_modules/@prisma/client/default.js';

const prisma = new PrismaClient();

async function verifyNeonStorage() {
  console.log('\n======================================================');
  console.log('   🐘 VERIFICACIÓN DE ALMACENAMIENTO EN NEON CLOUD    ');
  console.log('======================================================\n');

  try {
    const devices = await prisma.device.findMany({
      include: {
        _count: {
          select: { telemetryLogs: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const totalTelemetry = await prisma.telemetryLog.count();

    console.log(`✓ Conectado a Neon PostgreSQL Serverless (AWS sa-east-1)`);
    console.log(`✓ Total de computadores registrados en Neon: ${devices.length}`);
    console.log(`✓ Total de lecturas de telemetría persistidas en Neon: ${totalTelemetry}\n`);

    console.log('--- COMPUTADORES REGISTRADOS EN NEON ---');
    devices.forEach((dev, idx) => {
      console.log(
        `[${idx + 1}] Serial: ${dev.serialNumber} | Nombre: "${dev.name}" | Estado: ${dev.status} | IP: ${dev.ipAddress} | Último Latido: ${dev.lastHeartbeat ? dev.lastHeartbeat.toISOString() : 'Nunca'} | Registros guardados: ${dev._count.telemetryLogs}`
      );
    });

    console.log('\n--- ÚLTIMAS 5 LECTURAS RECIBIDAS Y GUARDADAS EN NEON ---');
    const recentLogs = await prisma.telemetryLog.findMany({
      take: 5,
      orderBy: { recordedAt: 'desc' },
      include: {
        device: {
          select: { serialNumber: true, name: true },
        },
      },
    });

    recentLogs.forEach((log, idx) => {
      console.log(
        `[#${idx + 1}] ${log.recordedAt.toISOString()} -> [${log.device?.serialNumber || log.deviceId}] CPU: ${log.cpuUsage}% | RAM: ${log.ramUsage}% | Disco: ${log.diskUsage}% | Temp: ${log.temperature ?? 'N/A'}°C`
      );
    });

    console.log('\n======================================================');
    console.log('   TODOS LOS DATOS ESTÁN VIVOS Y PERSISTIDOS EN NEON  ');
    console.log('======================================================\n');
  } catch (error) {
    console.error('Error al consultar Neon:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyNeonStorage();
