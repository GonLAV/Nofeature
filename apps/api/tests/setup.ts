process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-characters!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-characters!';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters!';
