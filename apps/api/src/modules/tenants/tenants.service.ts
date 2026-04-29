import { TenantRepository } from '../../database/repositories/tenantRepository';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { JwtPayload } from '../../middleware/auth';

export class TenantsService {
  constructor(private readonly tenantRepo: TenantRepository) {}

  async getById(id: string, requestingUser: JwtPayload) {
    if (id !== requestingUser.tenantId && requestingUser.role !== 'owner') {
      throw new ForbiddenError();
    }
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) throw new NotFoundError('Tenant not found');
    return tenant;
  }

  async getMyTenant(requestingUser: JwtPayload) {
    const tenant = await this.tenantRepo.findById(requestingUser.tenantId);
    if (!tenant) throw new NotFoundError('Tenant not found');
    return tenant;
  }
}
