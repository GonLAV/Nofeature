"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentsController = void 0;
const zod_1 = require("zod");
const createSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(500),
    description: zod_1.z.string().optional(),
    severity: zod_1.z.enum(['P1', 'P2', 'P3', 'P4']),
});
const listQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(['open', 'investigating', 'mitigating', 'resolved', 'closed']).optional(),
    severity: zod_1.z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    page: zod_1.z.string().optional().transform((v) => (v ? parseInt(v, 10) : 1)),
    limit: zod_1.z.string().optional().transform((v) => (v ? parseInt(v, 10) : 20)),
});
const updateStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['open', 'investigating', 'mitigating', 'resolved', 'closed']),
});
const updateCommanderSchema = zod_1.z.object({
    commanderId: zod_1.z.string().uuid(),
});
class IncidentsController {
    constructor(incidentsService) {
        this.incidentsService = incidentsService;
        this.list = async (req, res, next) => {
            try {
                const query = listQuerySchema.parse(req.query);
                const result = await this.incidentsService.list(req.user.tenantId, query);
                res.json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
        this.create = async (req, res, next) => {
            try {
                const input = createSchema.parse(req.body);
                const incident = await this.incidentsService.create(input, req.user);
                res.status(201).json({ success: true, data: incident });
            }
            catch (err) {
                next(err);
            }
        };
        this.getById = async (req, res, next) => {
            try {
                const incident = await this.incidentsService.getById(req.params.id, req.user.tenantId);
                res.json({ success: true, data: incident });
            }
            catch (err) {
                next(err);
            }
        };
        this.updateStatus = async (req, res, next) => {
            try {
                const { status } = updateStatusSchema.parse(req.body);
                const incident = await this.incidentsService.updateStatus(req.params.id, status, req.user);
                res.json({ success: true, data: incident });
            }
            catch (err) {
                next(err);
            }
        };
        this.updateCommander = async (req, res, next) => {
            try {
                const { commanderId } = updateCommanderSchema.parse(req.body);
                const incident = await this.incidentsService.updateCommander(req.params.id, commanderId, req.user);
                res.json({ success: true, data: incident });
            }
            catch (err) {
                next(err);
            }
        };
        this.getTimeline = async (req, res, next) => {
            try {
                const timeline = await this.incidentsService.getTimeline(req.params.id, req.user.tenantId);
                res.json({ success: true, data: timeline });
            }
            catch (err) {
                next(err);
            }
        };
        this.delete = async (req, res, next) => {
            try {
                await this.incidentsService.delete(req.params.id, req.user);
                res.status(204).send();
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.IncidentsController = IncidentsController;
//# sourceMappingURL=incidents.controller.js.map