import { SecurityService } from './security.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SecurityService vehicle verification', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[AC-6] authorizes a vehicle with an allocation released for the current office-local day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T02:00:00.000Z'));
    const prisma = {
      parkingConfiguration: {
        findFirst: jest.fn().mockResolvedValue({ officeTimeZone: 'America/Los_Angeles' }),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ employeeId: 'employee-1', hasPermanentSticker: false }),
      },
      parkingAllocation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'allocation-1' }),
      },
    } as unknown as PrismaService;
    const service = new SecurityService(prisma);

    await expect(service.verifyVehicle('ABC-123')).resolves.toEqual({
      vehicleIdentifier: 'ABC-123',
      date: '2024-12-31',
      authorized: true,
      outcome: 'TEMPORARY_ALLOCATION_AUTHORIZED',
    });
    expect(prisma.parkingAllocation.findFirst).toHaveBeenCalledWith({
      where: {
        employeeId: 'employee-1',
        parkingRelease: {
          is: {
            releaseDate: new Date('2024-12-31T00:00:00.000Z'),
            status: 'CLAIMED',
          },
        },
      },
      select: { id: true },
    });
  });
});
