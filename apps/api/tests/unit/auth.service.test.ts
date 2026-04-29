import bcrypt from 'bcryptjs';
import { AuthService } from '../../src/modules/auth/auth.service';
import { UserRepository } from '../../src/modules/users/user.repository';

jest.mock('../../src/modules/users/user.repository');
jest.mock('../../src/config/redis', () => ({
  redis: { setex: jest.fn(), get: jest.fn(), del: jest.fn() },
}));

const mockUser = {
  id: 'user-123',
  tenant_id: 'tenant-123',
  email: 'test@example.com',
  password_hash: bcrypt.hashSync('Password1', 10),
  name: 'Test User',
  role: 'member',
  is_active: true,
};

describe('AuthService', () => {
  let authService: AuthService;
  let userRepo: jest.Mocked<UserRepository>;

  beforeEach(() => {
    userRepo = new UserRepository() as jest.Mocked<UserRepository>;
    authService = new AuthService(userRepo);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('returns tokens on valid credentials', async () => {
      userRepo.findByEmail.mockResolvedValue(mockUser as never);
      userRepo.updateLastLogin.mockResolvedValue();

      const result = await authService.login('test@example.com', 'Password1', '127.0.0.1');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user).not.toHaveProperty('password_hash');
    });

    it('throws on invalid password', async () => {
      userRepo.findByEmail.mockResolvedValue(mockUser as never);
      await expect(authService.login('test@example.com', 'WrongPass', '127.0.0.1'))
        .rejects.toThrow('Invalid credentials');
    });

    it('throws on non-existent user', async () => {
      userRepo.findByEmail.mockResolvedValue(null);
      await expect(authService.login('nobody@example.com', 'Password1', '127.0.0.1'))
        .rejects.toThrow('Invalid credentials');
    });

    it('throws when account disabled', async () => {
      userRepo.findByEmail.mockResolvedValue({ ...mockUser, is_active: false } as never);
      await expect(authService.login('test@example.com', 'Password1', '127.0.0.1'))
        .rejects.toThrow('Account is disabled');
    });
  });

  describe('register', () => {
    it('throws on duplicate email', async () => {
      userRepo.findByEmail.mockResolvedValue(mockUser as never);
      await expect(authService.register({
        email: 'test@example.com', password: 'Password1',
        name: 'Test', tenantId: 'tenant-123',
      })).rejects.toThrow('Email already in use');
    });

    it('creates user and returns tokens', async () => {
      userRepo.findByEmail.mockResolvedValue(null);
      userRepo.create.mockResolvedValue(mockUser as never);

      const result = await authService.register({
        email: 'new@example.com', password: 'Password1',
        name: 'New User', tenantId: 'tenant-123',
      });

      expect(result.accessToken).toBeDefined();
      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com', role: 'member' })
      );
    });
  });
});
