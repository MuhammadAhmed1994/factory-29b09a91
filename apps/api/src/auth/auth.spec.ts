import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, GoogleIdentityClaims, GoogleIdentityVerifier } from './auth.service';

// The persistence and external identity boundary are mocked: the test does not need a database
// connection or a live request to Google's certificate endpoint.
describe('auth', () => {
  it('[AC-8] authenticates an authorized Google Workspace employee using corporate email identity and seeded roles', async () => {
    const claims: GoogleIdentityClaims = {
      sub: 'google-subject-123',
      email: 'Alex.Morgan@Folio3.com',
      email_verified: true,
      hd: 'folio3.com',
      name: 'Alex Morgan',
      iss: 'https://accounts.google.com',
      aud: 'test-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };
    const employee = {
      id: 'employee-123',
      corporateEmail: 'alex.morgan@folio3.com',
      googleSubject: 'google-subject-123',
      displayName: 'Alex Morgan',
      isActive: true,
      roles: [{ role: 'EMPLOYEE' }],
    };
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue(employee) },
    } as unknown as PrismaService;
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-api-session'),
    } as unknown as JwtService;
    const verifier = {
      verify: jest.fn().mockResolvedValue(claims),
    } as unknown as GoogleIdentityVerifier;
    const service = new AuthService(prisma, jwt, verifier);

    const result = await service.createGoogleSession({ credential: 'verified-google-id-token' });

    expect(verifier.verify).toHaveBeenCalledWith('verified-google-id-token');
    expect(prisma.employee.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { googleSubject: 'google-subject-123' },
          { corporateEmail: 'alex.morgan@folio3.com' },
        ],
      },
      include: { roles: true },
    });
    expect(result).toEqual({
      accessToken: 'signed-api-session',
      tokenType: 'Bearer',
      expiresIn: 28800,
      employee: {
        id: 'employee-123',
        corporateEmail: 'alex.morgan@folio3.com',
        displayName: 'Alex Morgan',
        roles: ['EMPLOYEE'],
      },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'employee-123', employeeId: 'employee-123' },
      expect.objectContaining({ expiresIn: '8h' }),
    );
  });
});
