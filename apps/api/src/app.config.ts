import { randomBytes } from 'node:crypto';
import { INestApplication, Logger, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';

// Written by the factory: the one place the api reads its environment. No .env file is loaded and
// no secret or host is hard-coded: production must set what it needs and fails at boot if it doesn't;
// development and test fall back to values that are safe because they are never shared.
const logger = new Logger('Config');
const generated = new Map<string, string>();

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function fromEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

// A signing key, read when it is used (a test that sets the variable is honoured). Unset outside
// production: one random key per process and name -- sessions end on restart, and no key ever
// lives in the source.
function secret(name: string): string {
  const value = fromEnv(name);
  if (value) return value;
  if (isProduction()) throw new Error(`${name} must be set in production`);
  let key = generated.get(name);
  if (!key) {
    key = randomBytes(32).toString('hex');
    generated.set(name, key);
    logger.warn(`${name} is not set; using a random key for this process (sessions reset on restart)`);
  }
  return key;
}

// The web origins allowed to call the api with credentials: CORS_ORIGINS (comma-separated),
// required in production; unset outside production, the caller's origin is reflected.
function corsOrigins(): string[] | true {
  const listed = (fromEnv('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (listed.length) return listed;
  if (isProduction()) throw new Error('CORS_ORIGINS must be set in production');
  return true;
}

export const config = {
  get port(): number {
    return Number(fromEnv('PORT') ?? 3001);
  },
  get jwtSecret(): string {
    return secret('JWT_SECRET');
  },
};

// Shared by main.ts and the test setup, so tests exercise the same pipes and CORS as the app.
// Reading every required value here makes a misconfigured production api fail at boot, not on
// its first request.
export function configureApp(app: INestApplication): void {
  void config.jwtSecret;
  app.enableCors({ origin: corsOrigins(), credentials: true });
  // whitelist/forbidNonWhitelisted reject unknown fields; use the status the Spec requires (often 422).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => new UnprocessableEntityException(errors),
    }),
  );
}
