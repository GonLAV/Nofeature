import { registerSchema, loginSchema } from '../../src/modules/auth/auth.schema';
import { createIncidentSchema, updateStatusSchema } from '../../src/modules/incidents/incident.schema';

describe('auth schemas', () => {
  it('registerSchema accepts valid input', () => {
    const r = registerSchema.parse({
      email: 'JOE@Example.com',
      password: 'Password1',
      name: 'Joe',
      tenantId: '11111111-1111-1111-1111-111111111111',
    });
    expect(r.email).toBe('joe@example.com');
  });

  it('registerSchema rejects weak password (no uppercase)', () => {
    expect(() =>
      registerSchema.parse({
        email: 'joe@example.com',
        password: 'password1',
        name: 'Joe',
        tenantId: '11111111-1111-1111-1111-111111111111',
      })
    ).toThrow();
  });

  it('registerSchema rejects weak password (no digit)', () => {
    expect(() =>
      registerSchema.parse({
        email: 'joe@example.com',
        password: 'Passworddd',
        name: 'Joe',
        tenantId: '11111111-1111-1111-1111-111111111111',
      })
    ).toThrow();
  });

  it('registerSchema rejects bad UUID', () => {
    expect(() =>
      registerSchema.parse({
        email: 'joe@example.com',
        password: 'Password1',
        name: 'Joe',
        tenantId: 'not-a-uuid',
      })
    ).toThrow();
  });

  it('loginSchema accepts valid input and lowercases email', () => {
    const r = loginSchema.parse({ email: 'A@B.com', password: 'x' });
    expect(r.email).toBe('a@b.com');
  });

  it('loginSchema rejects empty password', () => {
    expect(() => loginSchema.parse({ email: 'a@b.com', password: '' })).toThrow();
  });
});

describe('incident schemas', () => {
  it('createIncidentSchema accepts valid input', () => {
    const r = createIncidentSchema.parse({
      title: 'Database is down',
      description: 'Customers cannot log in. 5xx everywhere.',
      severity: 'P1',
    });
    expect(r.severity).toBe('P1');
  });

  it('createIncidentSchema rejects too-short title', () => {
    expect(() =>
      createIncidentSchema.parse({ title: 'oh', description: 'x'.repeat(20), severity: 'P1' })
    ).toThrow();
  });

  it('createIncidentSchema rejects bad severity', () => {
    expect(() =>
      createIncidentSchema.parse({ title: 'Outage of api', description: 'x'.repeat(20), severity: 'P9' })
    ).toThrow();
  });

  it('updateStatusSchema accepts valid status', () => {
    expect(updateStatusSchema.parse({ status: 'investigating' }).status).toBe('investigating');
  });

  it('updateStatusSchema rejects bad status', () => {
    expect(() => updateStatusSchema.parse({ status: 'wat' })).toThrow();
  });
});
