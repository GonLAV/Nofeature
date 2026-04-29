import request from 'supertest';
import { createApp } from '../../src/app';
import { pool } from '../../src/config/database';

jest.mock('../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    on: jest.fn(),
  },
}));

jest.mock('../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    connect: jest.fn(),
    on: jest.fn(),
  },
  connectRedis: jest.fn(),
}));

const mockPool = pool as jest.Mocked<typeof pool>;

const app = createApp();

const mockTenant = {
  id: 'tenant-uuid-1',
  name: 'Test Corp',
  slug: 'test-corp',
  created_at: new Date(),
};

const mockUser = {
  id: 'user-uuid-1',
  tenant_id: 'tenant-uuid-1',
  email: 'admin@testcorp.com',
  password_hash: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj3oW5y1HxuK',
  first_name: 'Admin',
  last_name: 'User',
  role: 'owner',
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('Auth Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })           // findByEmail -> not found
        .mockResolvedValueOnce({ rows: [] })           // findBySlug -> not found
        .mockResolvedValueOnce({ rows: [mockTenant] }) // create tenant
        .mockResolvedValueOnce({ rows: [mockUser] })   // create user
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // store refresh token

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'admin@testcorp.com',
          password: 'securePassword123',
          firstName: 'Admin',
          lastName: 'User',
          orgName: 'Test Corp',
          orgSlug: 'test-corp',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('should return 400 for invalid input', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'short' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 409 if email already exists', async () => {
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'admin@testcorp.com',
          password: 'securePassword123',
          firstName: 'Admin',
          lastName: 'User',
          orgName: 'Test Corp',
          orgSlug: 'test-corp',
        });

      expect(response.status).toBe(409);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return 400 for invalid body', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'invalid' });

      expect(response.status).toBe(400);
    });

    it('should return 401 for non-existent user', async () => {
      (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'notfound@example.com', password: 'password123' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return 401 without token', async () => {
      const response = await request(app).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
