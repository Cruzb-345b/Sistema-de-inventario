import { Router } from 'express';
import { DeviceController } from '../controllers/device.controller';

const router = Router();
const controller = new DeviceController();

// CSV Export and Import routes (must precede /:id)
router.get('/export/csv', (req, res, next) => controller.exportCsv(req, res, next));
router.post('/import/csv', (req, res, next) => controller.importCsv(req, res, next));

// Core CRUD Device routes
router.get('/', (req, res, next) => controller.listDevices(req, res, next));
router.post('/', (req, res, next) => controller.createDevice(req, res, next));
router.get('/:id', (req, res, next) => controller.getDeviceById(req, res, next));
router.put('/:id', (req, res, next) => controller.updateDevice(req, res, next));
router.delete('/:id', (req, res, next) => controller.deleteDevice(req, res, next));

// Telemetry intake endpoint (called by Python agent)
router.post('/:id/telemetry', (req, res, next) => controller.recordTelemetry(req, res, next));

export default router;
