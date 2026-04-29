import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { IncidentsService } from './incidents.service';

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  severity: z.enum(['P1', 'P2', 'P3', 'P4']),
});

const listQuerySchema = z.object({
  status: z.enum(['open', 'investigating', 'mitigating', 'resolved', 'closed']).optional(),
  severity: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
  page: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 20)),
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'investigating', 'mitigating', 'resolved', 'closed']),
});

const updateCommanderSchema = z.object({
  commanderId: z.string().uuid(),
});

export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listQuerySchema.parse(req.query);
      const result = await this.incidentsService.list(req.user!.tenantId, query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createSchema.parse(req.body);
      const incident = await this.incidentsService.create(input, req.user!);
      res.status(201).json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const incident = await this.incidentsService.getById(req.params.id, req.user!.tenantId);
      res.json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status } = updateStatusSchema.parse(req.body);
      const incident = await this.incidentsService.updateStatus(req.params.id, status, req.user!);
      res.json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  };

  updateCommander = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { commanderId } = updateCommanderSchema.parse(req.body);
      const incident = await this.incidentsService.updateCommander(req.params.id, commanderId, req.user!);
      res.json({ success: true, data: incident });
    } catch (err) {
      next(err);
    }
  };

  getTimeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timeline = await this.incidentsService.getTimeline(req.params.id, req.user!.tenantId);
      res.json({ success: true, data: timeline });
    } catch (err) {
      next(err);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.incidentsService.delete(req.params.id, req.user!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
