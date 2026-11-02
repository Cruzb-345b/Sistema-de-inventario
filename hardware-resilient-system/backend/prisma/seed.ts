import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_DEVICES = [
  {
    serialNumber: 'SRV-RACK-089A',
    name: 'Core Edge Router 01',
    model: 'Dell PowerEdge R640',
    ipAddress: '192.168.10.15',
    macAddress: '00:1A:2B:3C:4D:01',
    location: 'Datacenter A - Rack 04',
    status: 'ONLINE' as const,
    telemetry: {
      cpuUsage: 34.2,
      ramUsage: 58.7,
      diskUsage: 41.5,
      uptimeSeconds: 846200,
      temperature: 42.5,
    },
  },
  {
    serialNumber: 'SRV-STOR-112B',
    name: 'Distributed Storage Node',
    model: 'HP ProLiant DL380 Gen10',
    ipAddress: '192.168.10.16',
    macAddress: '00:1A:2B:3C:4D:02',
    location: 'Datacenter A - Rack 05',
    status: 'DEGRADED' as const,
    telemetry: {
      cpuUsage: 94.6,
      ramUsage: 91.2,
      diskUsage: 89.4,
      uptimeSeconds: 1420500,
      temperature: 68.0,
    },
  },
  {
    serialNumber: 'SRV-GATE-994C',
    name: 'Industrial Gateway Alpha',
    model: 'Advantech UNO-2484G',
    ipAddress: '192.168.20.5',
    macAddress: '00:1A:2B:3C:4D:03',
    location: 'Plant Substation 2',
    status: 'MAINTENANCE' as const,
    telemetry: {
      cpuUsage: 0.0,
      ramUsage: 0.0,
      diskUsage: 22.0,
      uptimeSeconds: 0,
      temperature: 24.0,
    },
  },
  {
    serialNumber: 'SRV-SNSR-440D',
    name: 'Telemetry Aggregator Hub',
    model: 'Supermicro SuperServer',
    ipAddress: '192.168.10.22',
    macAddress: '00:1A:2B:3C:4D:04',
    location: 'Datacenter B - Rack 01',
    status: 'ONLINE' as const,
    telemetry: {
      cpuUsage: 18.5,
      ramUsage: 42.1,
      diskUsage: 35.8,
      uptimeSeconds: 294000,
      temperature: 38.2,
    },
  },
];

async function main() {
  console.log('🌱 Seeding PostgreSQL inventory database...');

  for (const item of SEED_DEVICES) {
    const { telemetry, ...deviceData } = item;

    const device = await prisma.device.upsert({
      where: { serialNumber: deviceData.serialNumber },
      update: {
        name: deviceData.name,
        model: deviceData.model,
        ipAddress: deviceData.ipAddress,
        macAddress: deviceData.macAddress,
        location: deviceData.location,
        status: deviceData.status,
        lastHeartbeat: new Date(),
      },
      create: {
        ...deviceData,
        lastHeartbeat: new Date(),
      },
    });

    await prisma.telemetryLog.create({
      data: {
        deviceId: device.id,
        ...telemetry,
      },
    });

    console.log(` ✅ Seeded device: ${device.name} [${device.serialNumber}]`);
  }

  console.log('✨ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
