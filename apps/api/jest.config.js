module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  collectCoverageFrom: ['src/**/*.ts', '!src/app.ts'],
  coverageThreshold: { global: { branches: 60, functions: 60, lines: 60, statements: 60 } },
  setupFiles: ['<rootDir>/tests/setup.ts'],
};
