import { randomBytes } from 'node:crypto';
import { INestApplication, Logger, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';

// Written by the factory: the one place the api reads its environment. No .env file is loaded and
// no secret or host is hard-coded: production must set what it needs and fails at boot if it doesn't;
// development and test fall back to values that are safe because they are never shared.
const logger = new Logger('Config');
const generated = new Map<string, string>();
const FOLIO3_EMAIL_DOMAIN = 'folio3.com';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function fromEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function requiredInProduction(name: string, value: string | undefined): string | undefined {
  if (!value && isProduction()) throw new Error(`${name} must be set in production`);
  return value;
}

function googleOAuthClientValue(name: 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'): string | undefined {
  return requiredInProduction(name, fromEnv(name));
}

function validateOfficeTimeZone(value: string | undefined): string {
  const timeZone = requiredInProduction('OFFICE_TIME_ZONE', value) ?? 'UTC';
  try {
    // Intl uses the runtime's IANA time-zone database and throws for malformed/unknown identifiers.
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new Error('OFFICE_TIME_ZONE must be a valid IANA time-zone identifier');
  }
  return timeZone;
}

function validateDailyParkingReleaseTime(value: string | undefined): string {
  const time = value ?? '08:00';
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('DAILY_PARKING_RELEASE_TIME must be a valid office-local time in HH:mm format');
  }
  return time;
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
  get googleClientId(): string | undefined {
    return googleOAuthClientValue('GOOGLE_CLIENT_ID');
  },
  get googleClientSecret(): string | undefined {
    return googleOAuthClientValue('GOOGLE_CLIENT_SECRET');
  },
  // This is a fixed identity policy rather than an operator-overridable domain: accepting a
  // different domain would also allow personal or unrelated-provider accounts to sign in.
  get googleAllowedEmailDomain(): string {
    return FOLIO3_EMAIL_DOMAIN;
  },
  get officeTimeZone(): string {
    return validateOfficeTimeZone(fromEnv('OFFICE_TIME_ZONE'));
  },
  get dailyParkingReleaseTime(): string {
    return validateDailyParkingReleaseTime(fromEnv('DAILY_PARKING_RELEASE_TIME'));
  },
  // Outbound mail for the weekly utilization report. Unset outside production: the report is
  // still generated and stored, and the mailer logs instead of contacting a server.
  get smtp(): {
    host?: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
  } {
    const port = Number(fromEnv('SMTP_PORT') ?? 587);
    return {
      host: requiredInProduction('SMTP_HOST', fromEnv('SMTP_HOST')),
      port: Number.isFinite(port) ? port : 587,
      secure: (fromEnv('SMTP_SECURE') ?? '').toLowerCase() === 'true',
      user: fromEnv('SMTP_USER'),
      password: fromEnv('SMTP_PASSWORD'),
      from: fromEnv('REPORT_FROM_ADDRESS') ?? 'parking-reports@folio3.com',
    };
  },
  /** Stakeholders who receive the weekly utilization report (comma-separated). */
  get reportRecipients(): string[] {
    const listed = (fromEnv('REPORT_RECIPIENTS') ?? '')
      .split(',')
      .map((address) => address.trim())
      .filter(Boolean);
    if (!listed.length && isProduction()) throw new Error('REPORT_RECIPIENTS must be set in production');
    return listed;
  },
  /** Office-local time the weekly report is generated and emailed each Monday. */
  get weeklyReportTime(): string {
    const value = fromEnv('WEEKLY_REPORT_TIME') ?? '07:00';
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new Error('WEEKLY_REPORT_TIME must be a valid office-local time in HH:mm format');
    }
    return value;
  },
};

// Shared by main.ts and the test setup, so tests exercise the same pipes and CORS as the app.
// Reading every required value here makes a misconfigured production api fail at boot, not on
// its first request.
export function configureApp(app: INestApplication): void {
  void config.jwtSecret;
  const googleClientId = config.googleClientId;
  const googleClientSecret = config.googleClientSecret;
  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together');
  }
  void config.googleAllowedEmailDomain;
  void config.officeTimeZone;
  void config.dailyParkingReleaseTime;
  void config.smtp;
  void config.reportRecipients;
  void config.weeklyReportTime;
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
