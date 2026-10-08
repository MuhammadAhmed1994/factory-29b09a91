import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createVerify } from 'node:crypto';
import { get } from 'node:https';
import { config } from '../app.config';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSessionDto } from './dto/google-session.dto';

export interface GoogleIdentityClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  hd?: string;
  name?: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  azp?: string;
}

export interface AuthSessionEmployee {
  id: string;
  corporateEmail: string;
  displayName: string;
  roles: string[];
}

export interface AuthSessionResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  employee: AuthSessionEmployee;
}

interface GoogleCertificateResponse {
  [keyId: string]: string;
}

/** Validates Google's signed ID tokens against Google's published signing certificates. */
@Injectable()
export class GoogleIdentityVerifier {
  private certificates?: GoogleCertificateResponse;
  private certificatesExpireAt = 0;

  async verify(credential: string): Promise<GoogleIdentityClaims> {
    try {
      const [encodedHeader, encodedClaims, encodedSignature, ...extra] = credential.split('.');
      if (!encodedHeader || !encodedClaims || !encodedSignature || extra.length) throw new Error();
      const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as {
        alg?: string;
        kid?: string;
      };
      const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8')) as GoogleIdentityClaims;
      if (header.alg !== 'RS256' || !header.kid) throw new Error();

      const certificates = await this.getCertificates();
      const certificate = certificates[header.kid];
      if (!certificate) throw new Error();
      const signatureValid = createVerify('RSA-SHA256')
        .update(`${encodedHeader}.${encodedClaims}`)
        .verify(certificate, Buffer.from(encodedSignature, 'base64url'));
      if (!signatureValid) throw new Error();
      this.validateClaims(claims);
      return claims;
    } catch {
      // Do not reveal parsing, signing-key, or identity details to an unauthenticated caller.
      throw new UnauthorizedException('Google authentication failed');
    }
  }

  private validateClaims(claims: GoogleIdentityClaims): void {
    const clientId = config.googleClientId;
    const now = Math.floor(Date.now() / 1000);
    const audienceMatches = typeof claims.aud === 'string'
      ? claims.aud === clientId
      : Array.isArray(claims.aud) && claims.aud.includes(clientId ?? '');
    const issuerMatches = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    const domain = config.googleAllowedEmailDomain.toLowerCase();

    if (
      !clientId || !claims.sub || !issuerMatches || !audienceMatches ||
      (claims.azp !== undefined && claims.azp !== clientId) ||
      !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
      claims.email_verified !== true || !email.endsWith(`@${domain}`) ||
      claims.hd?.toLowerCase() !== domain
    ) {
      throw new Error('Invalid Google identity claims');
    }
  }

  private async getCertificates(): Promise<GoogleCertificateResponse> {
    if (this.certificates && Date.now() < this.certificatesExpireAt) return this.certificates;

    const response = await new Promise<{ body: string; cacheControl: string }>((resolve, reject) => {
      const request = get('https://www.googleapis.com/oauth2/v1/certs', (result) => {
        if (result.statusCode !== 200) {
          result.resume();
          reject(new Error('Google signing certificate request failed'));
          return;
        }
        let body = '';
        result.setEncoding('utf8');
        result.on('data', (chunk: string) => { body += chunk; });
        result.on('end', () => resolve({
          body,
          cacheControl: result.headers['cache-control'] ?? '',
        }));
      });
      request.setTimeout(5000, () => request.destroy(new Error('Google certificate request timed out')));
      request.on('error', reject);
    });

    const certificates = JSON.parse(response.body) as GoogleCertificateResponse;
    if (!certificates || typeof certificates !== 'object') throw new Error('Invalid certificate response');
    const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(response.cacheControl)?.[1];
    this.certificates = certificates;
    this.certificatesExpireAt = Date.now() + (maxAge ? Number(maxAge) : 300) * 1000;
    return certificates;
  }
}

/** Exchanges verified Google Workspace credentials for the application's signed employee session. */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly googleIdentityVerifier: GoogleIdentityVerifier,
  ) {}

  async createGoogleSession(dto: GoogleSessionDto): Promise<AuthSessionResult> {
    const claims = await this.googleIdentityVerifier.verify(dto.credential);
    const corporateEmail = claims.email.trim().toLowerCase();
    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [
          { googleSubject: claims.sub },
          { corporateEmail },
        ],
      },
      include: { roles: true },
    });

    // Both identity keys must identify the same provisioned, active employee. Never auto-provision
    // an unknown Google account or disclose whether either key matched on a rejected request.
    if (
      !employee || !employee.isActive || employee.googleSubject !== claims.sub ||
      employee.corporateEmail.toLowerCase() !== corporateEmail
    ) {
      throw new UnauthorizedException('Google authentication failed');
    }

    const accessToken = await this.jwtService.signAsync(
      { sub: employee.id, employeeId: employee.id },
      { secret: config.jwtSecret, expiresIn: '8h' },
    );
    const roles = employee.roles.map(({ role }) => role);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 8 * 60 * 60,
      employee: {
        id: employee.id,
        corporateEmail,
        displayName: employee.displayName,
        roles,
      },
    };
  }
}
