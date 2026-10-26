import 'dotenv/config';

const required = ['DATABASE_URL', 'JWT_SECRET', 'COORDINATOR_CODE'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

export const config = {
  databaseUrl: process.env.DATABASE_URL,
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  coordinatorCode: process.env.COORDINATOR_CODE,
  port: Number(process.env.PORT ?? 3000),
};
