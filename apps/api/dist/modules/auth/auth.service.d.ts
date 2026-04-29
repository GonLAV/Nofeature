import { UserRepository } from '../../database/repositories/userRepository';
import { TenantRepository } from '../../database/repositories/tenantRepository';
export interface RegisterInput {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    orgName: string;
    orgSlug: string;
}
export interface LoginInput {
    email: string;
    password: string;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}
export declare class AuthService {
    private readonly userRepo;
    private readonly tenantRepo;
    constructor(userRepo: UserRepository, tenantRepo: TenantRepository);
    register(input: RegisterInput): Promise<AuthTokens>;
    login(input: LoginInput): Promise<AuthTokens>;
    refresh(refreshToken: string): Promise<{
        accessToken: string;
    }>;
    logout(refreshToken: string): Promise<void>;
    getMe(userId: string): Promise<Omit<import('../../database/repositories/userRepository').User, 'password_hash'>>;
    private generateTokens;
    private hashToken;
}
//# sourceMappingURL=auth.service.d.ts.map