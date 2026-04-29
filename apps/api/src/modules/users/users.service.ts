import { UserRepository } from '../../database/repositories/userRepository';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { JwtPayload, UserRole } from '../../middleware/auth';

export class UsersService {
  constructor(private readonly userRepo: UserRepository) {}

  async listByTenant(tenantId: string) {
    const users = await this.userRepo.findByTenantId(tenantId);
    return users.map(({ password_hash: _ph, ...u }) => u);
  }

  async getById(id: string, requestingUser: JwtPayload) {
    const user = await this.userRepo.findById(id);
    if (!user) throw new NotFoundError('User not found');
    if (user.tenant_id !== requestingUser.tenantId) throw new ForbiddenError();
    const { password_hash: _ph, ...safeUser } = user;
    return safeUser;
  }

  async updateRole(id: string, role: UserRole, requestingUser: JwtPayload) {
    const user = await this.userRepo.findById(id);
    if (!user) throw new NotFoundError('User not found');
    if (user.tenant_id !== requestingUser.tenantId) throw new ForbiddenError();
    return this.userRepo.updateRole(id, role);
  }

  async deactivate(id: string, requestingUser: JwtPayload) {
    const user = await this.userRepo.findById(id);
    if (!user) throw new NotFoundError('User not found');
    if (user.tenant_id !== requestingUser.tenantId) throw new ForbiddenError();
    if (id === requestingUser.sub) throw new ForbiddenError('Cannot deactivate yourself');
    await this.userRepo.deactivate(id);
  }
}
