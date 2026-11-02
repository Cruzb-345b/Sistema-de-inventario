import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  CreateDeviceSchema,
  UpdateDeviceSchema,
  DeviceParamSchema,
  TelemetryPayloadSchema,
  DeviceQuerySchema,
  DeviceCsvRowSchema,
  DeviceStatus,
} from '../schemas/device.schema';
import { formatSafeCsv, desanitizeCsvCell } from '../utils/csvSanitizer';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

export class DeviceController {
  /**
   * GET /api/devices
   * List devices with optional status filter, search query, and pagination
   */
  public async listDevices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = DeviceQuerySchema.parse(req.query);
      const skip = (query.page - 1) * query.limit;

      const whereClause: {
        status?: DeviceStatus;
        OR?: Array<{
          name?: { contains: string; mode: 'insensitive' };
          serialNumber?: { contains: string; mode: 'insensitive' };
          location?: { contains: string; mode: 'insensitive' };
        }>;
      } = {};

      if (query.status) {
        whereClause.status = query.status;
      }

      if (query.search) {
        whereClause.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { serialNumber: { contains: query.search, mode: 'insensitive' } },
          { location: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [total, devices] = await Promise.all([
        prisma.device.count({ where: whereClause }),
        prisma.device.findMany({
          where: whereClause,
          skip,
          take: query.limit,
          orderBy: { updatedAt: 'desc' },
          include: {
            telemetryLogs: {
              take: 1,
              orderBy: { recordedAt: 'desc' },
            },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: devices,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/devices/:id
   * Get single device by ID with recent telemetry logs
   */
  public async getDeviceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = DeviceParamSchema.parse(req.params);

      const device = await prisma.device.findUnique({
        where: { id },
        include: {
          telemetryLogs: {
            take: 20,
            orderBy: { recordedAt: 'desc' },
          },
        },
      });

      if (!device) {
        throw new AppError(`Device with ID "${id}" was not found`, 404, 'DEVICE_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: device,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/devices
   * Create a new hardware device
   */
  public async createDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = CreateDeviceSchema.parse(req.body);

      const createdDevice = await prisma.device.create({
        data: {
          serialNumber: validatedData.serialNumber,
          name: validatedData.name,
          model: validatedData.model,
          ipAddress: validatedData.ipAddress,
          macAddress: validatedData.macAddress,
          location: validatedData.location,
          status: validatedData.status,
        },
      });

      res.status(201).json({
        success: true,
        data: createdDevice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/devices/:id
   * Update device information
   */
  public async updateDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = DeviceParamSchema.parse(req.params);
      const validatedData = UpdateDeviceSchema.parse(req.body);

      const updatedDevice = await prisma.device.update({
        where: { id },
        data: validatedData,
      });

      res.status(200).json({
        success: true,
        data: updatedDevice,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/devices/:id
   * Remove device and its cascade logs
   */
  public async deleteDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = DeviceParamSchema.parse(req.params);

      await prisma.device.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: `Device with ID ${id} deleted successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/devices/:id/telemetry
   * Endpoint called by Python telemetry agent with exponential backoff protection
   */
  public async recordTelemetry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = DeviceParamSchema.parse(req.params);
      const payload = TelemetryPayloadSchema.parse(req.body);

      // Verify device existence or find by serialNumber/id
      const device = await prisma.device.findFirst({
        where: {
          OR: [{ id }, { serialNumber: id }],
        },
      });

      if (!device) {
        throw new AppError(`Target device "${id}" is not registered in the system`, 404, 'DEVICE_NOT_FOUND');
      }

      // Automatically compute health degradation if resources exceed critical thresholds
      const isDegraded = payload.cpuUsage > 90 || payload.ramUsage > 92 || payload.diskUsage > 95;
      const computedStatus: DeviceStatus = isDegraded ? 'DEGRADED' : 'ONLINE';

      // Atomic transaction: Insert telemetry log and update device lastHeartbeat & status
      const [log] = await prisma.$transaction([
        prisma.telemetryLog.create({
          data: {
            deviceId: device.id,
            cpuUsage: payload.cpuUsage,
            ramUsage: payload.ramUsage,
            diskUsage: payload.diskUsage,
            uptimeSeconds: payload.uptimeSeconds,
            temperature: payload.temperature,
          },
        }),
        prisma.device.update({
          where: { id: device.id },
          data: {
            lastHeartbeat: new Date(),
            status: computedStatus,
          },
        }),
      ]);

      res.status(201).json({
        success: true,
        message: 'Telemetry recorded successfully',
        data: {
          logId: log.id,
          recordedAt: log.recordedAt,
          deviceStatus: computedStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/devices/export/csv
   * Export devices sanitized against Spreadsheet Formula Injection (=, +, -, @, \t, \r)
   */
  public async exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const devices = await prisma.device.findMany({
        orderBy: { serialNumber: 'asc' },
      });

      const exportRows = devices.map((d) => ({
        serialNumber: d.serialNumber,
        name: d.name,
        model: d.model,
        ipAddress: d.ipAddress,
        macAddress: d.macAddress,
        location: d.location,
        status: d.status,
        lastHeartbeat: d.lastHeartbeat ? d.lastHeartbeat.toISOString() : 'N/A',
        createdAt: d.createdAt.toISOString(),
      }));

      const csvContent = formatSafeCsv(exportRows);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="hardware_devices_export.csv"');
      res.status(200).send(csvContent);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/devices/import/csv
   * Import devices from parsed CSV payload with formula stripping & schema validation
   */
  public async importCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRows: unknown = req.body.rows;
      if (!Array.isArray(rawRows)) {
        throw new AppError('Field "rows" must be an array of CSV row objects', 400, 'INVALID_CSV_PAYLOAD');
      }

      const importedDevices = [];
      const errors = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (typeof row !== 'object' || row === null) {
          errors.push({ row: i + 1, message: 'Row must be a valid key-value object' });
          continue;
        }

        // Desanitize any defensive quotes before schema parsing
        const record = row as Record<string, unknown>;
        const normalized: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(record)) {
          normalized[key] = desanitizeCsvCell(val);
        }

        const parseResult = DeviceCsvRowSchema.safeParse(normalized);
        if (!parseResult.success) {
          errors.push({
            row: i + 1,
            errors: parseResult.error.issues.map(
              (e: { path: (string | number)[]; message: string }) => `${e.path.join('.')}: ${e.message}`
            ),
          });
          continue;
        }

        const data = parseResult.data;

        // Upsert by serialNumber
        const device = await prisma.device.upsert({
          where: { serialNumber: data.serialNumber },
          create: {
            serialNumber: data.serialNumber,
            name: data.name,
            model: data.model,
            ipAddress: data.ipAddress,
            macAddress: data.macAddress,
            location: data.location,
            status: data.status,
          },
          update: {
            name: data.name,
            model: data.model,
            ipAddress: data.ipAddress,
            macAddress: data.macAddress,
            location: data.location,
            status: data.status,
          },
        });

        importedDevices.push(device);
      }

      res.status(200).json({
        success: true,
        summary: {
          totalRows: rawRows.length,
          successful: importedDevices.length,
          failed: errors.length,
        },
        data: importedDevices,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/telemetry/feed
   * Returns recent telemetry logs across all devices for live stream display
   */
  public async getTelemetryFeed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = Math.min(Math.max(1, Number(req.query.limit) || 25), 100);

      const logs = await prisma.telemetryLog.findMany({
        take: limit,
        orderBy: { recordedAt: 'desc' },
        include: {
          device: {
            select: {
              id: true,
              serialNumber: true,
              name: true,
              location: true,
              status: true,
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        data: logs,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
}

