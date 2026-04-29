import { UserRepository } from '../../database/repositories/userRepository';
import { JwtPayload, UserRole } from '../../middleware/auth';
export declare class UsersService {
    private readonly userRepo;
    constructor(userRepo: UserRepository);
    listByTenant(tenantId: string): Promise<{
        id: string;
        tenant_id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: UserRole;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
    }[]>;
    getById(id: string, requestingUser: JwtPayload): Promise<{
        id: string;
        tenant_id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: UserRole;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
    }>;
    updateRole(id: string, role: UserRole, requestingUser: JwtPayload): Promise<import("../../database/repositories/userRepository").User | null>;
    deactivate(id: string, requestingUser: JwtPayload): Promise<void>;
}
//# sourceMappingURL=users.service.d.ts.map