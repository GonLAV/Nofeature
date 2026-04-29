import { Request, Response, NextFunction } from 'express';
import { TenantsService } from './tenants.service';

export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  getMyTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenant = await this.tenantsService.getMyTenant(req.user!);
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenant = await this.tenantsService.getById(req.params.id, req.user!);
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  };
}
