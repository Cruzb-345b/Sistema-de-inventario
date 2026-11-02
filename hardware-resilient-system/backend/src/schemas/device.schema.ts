import { z } from 'zod';

export const DeviceStatusEnum = z.enum(['ONLINE', 'OFFLINE', 'DEGRADED', 'MAINTENANCE']);
export type DeviceStatus = z.infer<typeof DeviceStatusEnum>;

export const CreateDeviceSchema = z.object({
  serialNumber: z
    .string()
    .trim()
    .min(3, { message: 'Serial number must be at least 3 characters long' })
    .max(64, { message: 'Serial number cannot exceed 64 characters' }),
  name: z
    .string()
    .trim()
    .min(2, { message: 'Device name must be at least 2 characters long' })
    .max(100, { message: 'Device name cannot exceed 100 characters' }),
  model: z
    .string()
    .trim()
    .min(2, { message: 'Model must be at least 2 characters long' })
    .max(80, { message: 'Model cannot exceed 80 characters' }),
  ipAddress: z
    .string()
    .trim()
    .regex(
      /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
      { message: 'Valid IPv4 address required' }
    ),
  macAddress: z
    .string()
    .trim()
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, {
      message: 'Valid MAC address format required (e.g. 00:1A:2B:3C:4D:5E)',
    }),
  location: z
    .string()
    .trim()
    .min(2, { message: 'Location must be at least 2 characters' })
    .max(120, { message: 'Location cannot exceed 120 characters' }),
  status: DeviceStatusEnum.default('OFFLINE'),
});

export type CreateDeviceInput = z.infer<typeof CreateDeviceSchema>;

export const UpdateDeviceSchema = CreateDeviceSchema.partial();
export type UpdateDeviceInput = z.infer<typeof UpdateDeviceSchema>;

export const DeviceParamSchema = z.object({
  id: z.string().trim().min(1, { message: 'Device ID is required' }),
});
export type DeviceParamInput = z.infer<typeof DeviceParamSchema>;

export const TelemetryPayloadSchema = z.object({
  cpuUsage: z
    .number()
    .min(0, { message: 'CPU usage cannot be negative' })
    .max(100, { message: 'CPU usage cannot exceed 100%' }),
  ramUsage: z
    .number()
    .min(0, { message: 'RAM usage cannot be negative' })
    .max(100, { message: 'RAM usage cannot exceed 100%' }),
  diskUsage: z
    .number()
    .min(0, { message: 'Disk usage cannot be negative' })
    .max(100, { message: 'Disk usage cannot exceed 100%' }),
  uptimeSeconds: z
    .number()
    .min(0, { message: 'Uptime cannot be negative' })
    .default(0.0),
  temperature: z
    .number()
    .min(-50)
    .max(150)
    .optional(),
});
export type TelemetryPayloadInput = z.infer<typeof TelemetryPayloadSchema>;

export const DeviceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: DeviceStatusEnum.optional(),
  search: z.string().trim().optional(),
});
export type DeviceQueryInput = z.infer<typeof DeviceQuerySchema>;

export const DeviceCsvRowSchema = z.object({
  serialNumber: z.string().trim().min(3),
  name: z.string().trim().min(2),
  model: z.string().trim().min(2),
  ipAddress: z
    .string()
    .trim()
    .regex(
      /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    ),
  macAddress: z.string().trim().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/),
  location: z.string().trim().min(2),
  status: DeviceStatusEnum.optional().default('OFFLINE'),
});
export type DeviceCsvRow = z.infer<typeof DeviceCsvRowSchema>;
