import { Pool } from 'pg';
import { UserRole } from '../../middleware/auth';
export interface User {
    id: string;
    tenant_id: string;
    email: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    role: UserRole;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export type CreateUserData = {
    tenantId: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
};
export declare class UserRepository {
    private readonly db;
    constructor(db: Pool);
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    create(data: CreateUserData): Promise<User>;
    findByTenantId(tenantId: string): Promise<User[]>;
    updateRole(id: string, role: UserRole): Promise<User | null>;
    deactivate(id: string): Promise<void>;
    storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
    findRefreshToken(tokenHash: string): Promise<{
        user_id: string;
        expires_at: Date;
        revoked_at: Date | null;
    } | null>;
    revokeRefreshToken(tokenHash: string): Promise<void>;
}
//# sourceMappingURL=userRepository.d.ts.map