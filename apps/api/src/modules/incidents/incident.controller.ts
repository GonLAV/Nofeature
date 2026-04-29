import { Request, Response, NextFunction } from 'express';
import { IncidentService } from './incident.service';
import { IncidentRepository } from './incident.repository';
import { AIService } from '../ai/ai.service';
import { NotificationService } from '../notifications/notification.service';
import { createIncidentSchema, updateStatusSchema } from './incident.schema';

const incidentService = new IncidentService(
  new IncidentRepository(),
  new AIService(),
  new NotificationService(),
);

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, severity, page, limit } = req.query;
    const result = await incidentService.listIncidents(req.user!.tenantId, {
      status: status as string,
      severity: severity as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const getOne = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await incidentService.getIncident(req.params.id, req.user!.tenantId);
    res.json({ success: true, data: incident });
  } catch (err) { next(err); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createIncidentSchema.parse(req.body);
    const incident = await incidentService.createIncident({
      ...data,
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
    });
    res.status(201).json({ success: true, data: incident });
  } catch (err) { next(err); }
};

export const updateStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = updateStatusSchema.parse(req.body);
    const incident = await incidentService.updateStatus(
      req.params.id, req.user!.tenantId, status, req.user!.userId
    );
    res.json({ success: true, data: incident });
  } catch (err) { next(err); }
};

export const assignCommander = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { commanderId } = req.body;
    const incident = await incidentService.assignCommander(
      req.params.id, req.user!.tenantId, commanderId, req.user!.userId
    );
    res.json({ success: true, data: incident });
  } catch (err) { next(err); }
};

export const timeline = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await incidentService.getTimeline(req.params.id, req.user!.tenantId);
    res.json({ success: true, data: entries });
  } catch (err) { next(err); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await incidentService.deleteIncident(req.params.id, req.user!.tenantId, req.user!.userId, req.user!.role);
    res.json({ success: true, message: 'Incident deleted' });
  } catch (err) { next(err); }
};
