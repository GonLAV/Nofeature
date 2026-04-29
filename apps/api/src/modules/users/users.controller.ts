import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UsersService } from './users.service';

const updateRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'manager', 'member', 'viewer']),
});

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await this.usersService.listByTenant(req.user!.tenantId);
      res.json({ success: true, data: users });
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.usersService.getById(req.params.id, req.user!);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  };

  updateRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { role } = updateRoleSchema.parse(req.body);
      const user = await this.usersService.updateRole(req.params.id, role, req.user!);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  };

  deactivate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.usersService.deactivate(req.params.id, req.user!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
