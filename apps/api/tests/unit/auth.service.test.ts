import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../src/modules/auth/auth.service';
import { UserRepository } from '../../src/database/repositories/userRepository';
import { TenantRepository } from '../../src/database/repositories/tenantRepository';
import { ConflictError, UnauthorizedError } from '../../src/utils/errors';

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

const mockUserRepo = {
  findByEmail: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  storeRefreshToken: jest.fn(),
  findRefreshToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
} as unknown as UserRepository;

const mockTenantRepo = {
  findBySlug: jest.fn(),
  create: jest.fn(),
} as unknown as TenantRepository;

const authService = new AuthService(mockUserRepo, mockTenantRepo);

const mockUser = {
  id: 'user-1',
  tenant_id: 'tenant-1',
  email: 'test@example.com',
  password_hash: 'hashed',
  first_name: 'John',
  last_name: 'Doe',
  role: 'owner' as const,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockTenant = {
  id: 'tenant-1',
  name: 'Test Org',
  slug: 'test-org',
  created_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (jwt.sign as jest.Mock).mockReturnValue('mock-token');
});

describe('AuthService.register', () => {
  it('should register a new user and return tokens', async () => {
    (mockUserRepo.findByEmail as jest.Mock).mockResolvedValue(null);
    (mockTenantRepo.findBySlug as jest.Mock).mockResolvedValue(null);
    (mockTenantRepo.create as jest.Mock).mockResolvedValue(mockTenant);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
    (mockUserRepo.create as jest.Mock).mockResolvedValue(mockUser);
    (mockUserRepo.storeRefreshToken as jest.Mock).mockResolvedValue(undefined);

    const result = await authService.register({
      email: 'test@example.com',
      password: 'password123',
      firstName: 'John',
      lastName: 'Doe',
      orgName: 'Test Org',
      orgSlug: 'test-org',
    });

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(mockTenantRepo.create).toHaveBeenCalledWith({ name: 'Test Org', slug: 'test-org' });
    expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
  });

  it('should throw ConflictError if email already exists', async () => {
    (mockUserRepo.findByEmail as jest.Mock).mockResolvedValue(mockUser);

    await expect(
      authService.register({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        orgName: 'Test Org',
        orgSlug: 'test-org',
      })
    ).rejects.toThrow(ConflictError);
  });

  it('should throw ConflictError if slug already exists', async () => {
    (mockUserRepo.findByEmail as jest.Mock).mockResolvedValue(null);
    (mockTenantRepo.findBySlug as jest.Mock).mockResolvedValue(mockTenant);

    await expect(
      authService.register({
        email: 'new@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        orgName: 'Test Org',
        orgSlug: 'test-org',
      })
    ).rejects.toThrow(ConflictError);
  });
});

describe('AuthService.login', () => {
  it('should return tokens on valid credentials', async () => {
    (mockUserRepo.findByEmail as jest.Mock).mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (mockUserRepo.storeRefreshToken as jest.Mock).mockResolvedValue(undefined);

    const result = await authService.login({ email: 'test@example.com', password: 'password123' });

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
  });

  it('should throw UnauthorizedError if user not found', async () => {
    (mockUserRepo.findByEmail as jest.Mock).mockResolvedValue(null);

    await expect(
      authService.login({ email: 'nonexistent@example.com', password: 'password' })
    ).rejects.toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError if password is wrong', async () => {
    (mockUserRepo.findByEmail as jest.Mock).mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      authService.login({ email: 'test@example.com', password: 'wrongpassword' })
    ).rejects.toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError if user is inactive', async () => {
    (mockUserRepo.findByEmail as jest.Mock).mockResolvedValue({ ...mockUser, is_active: false });

    await expect(
      authService.login({ email: 'test@example.com', password: 'password123' })
    ).rejects.toThrow(UnauthorizedError);
  });
});
