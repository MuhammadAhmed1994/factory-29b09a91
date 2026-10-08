import { BadRequestException, Injectable } from '@nestjs/common';
import { ParkingConfiguration } from '@prisma/client';
import { config } from '../app.config';
import { PrismaService } from '../prisma/prisma.service';
import { ParkingReportQueryDto, ParkingReportType, UpdateParkingConfigurationDto } from './dto/operations.dto';

export type ParkingConfigurationResult = ParkingConfiguration;

export interface ParkingReportResult {
  reportType: ParkingReportType;
  startDate: string;
  endDate: string;
  data: unknown[];
}

const CONFIGURATION_ID = 'active-parking-configuration';
const MAX_REPORT_RANGE_DAYS = 366;

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfiguration(): Promise<ParkingConfigurationResult> {
    const existing = await this.prisma.parkingConfiguration.findFirst();
    if (existing) return existing;

    return this.prisma.parkingConfiguration.create({
      data: {
        id: CONFIGURATION_ID,
        dailyParkingReleaseTime: '08:00',
        officeTimeZone: config.officeTimeZone,
      },
    });
  }

  async updateConfiguration(body: UpdateParkingConfigurationDto): Promise<ParkingConfigurationResult> {
    if (body.dailyParkingReleaseTime === undefined && body.officeTimeZone === undefined) {
      throw new BadRequestException('At least one configuration field must be supplied');
    }
    if (body.officeTimeZone !== undefined) this.assertIanaTimeZone(body.officeTimeZone);

    const current = await this.prisma.parkingConfiguration.findFirst();
    if (current) {
      return this.prisma.parkingConfiguration.update({ where: { id: current.id }, data: body });
    }

    return this.prisma.parkingConfiguration.create({
      data: {
        id: CONFIGURATION_ID,
        dailyParkingReleaseTime: body.dailyParkingReleaseTime ?? '08:00',
        officeTimeZone: body.officeTimeZone ?? config.officeTimeZone,
      },
    });
  }

  async getReport(query: ParkingReportQueryDto): Promise<ParkingReportResult> {
    const { reportType, startDate, endDate } = query;
    const start = this.parseCalendarDate(startDate, 'startDate');
    const end = this.parseCalendarDate(endDate, 'endDate');
    const rangeDays = (end.getTime() - start.getTime()) / 86_400_000 + 1;
    if (rangeDays < 1 || rangeDays > MAX_REPORT_RANGE_DAYS) {
      throw new BadRequestException(`Date range must be between 1 and ${MAX_REPORT_RANGE_DAYS} days`);
    }
    const endExclusive = new Date(end.getTime() + 86_400_000);
    const dateRange = { gte: start, lt: endExclusive };

    let data: unknown[];
    switch (reportType) {
      case ParkingReportType.EMPLOYEES:
        data = await this.prisma.employee.findMany({
          where: { createdAt: dateRange },
          include: { assignments: true, allocations: true },
          orderBy: { createdAt: 'asc' },
        });
        break;
      case ParkingReportType.ASSIGNMENTS:
        data = await this.prisma.parkingAssignment.findMany({
          where: { effectiveFrom: dateRange },
          include: {
            employee: true,
            parkingSpace: { include: { parkingFloor: true } },
          },
          orderBy: { effectiveFrom: 'asc' },
        });
        break;
      case ParkingReportType.RELEASES:
        data = await this.prisma.parkingRelease.findMany({
          where: { releaseDate: dateRange },
          include: {
            parkingAssignment: {
              include: {
                employee: true,
                parkingSpace: { include: { parkingFloor: true } },
              },
            },
            allocation: { include: { employee: true } },
          },
          orderBy: { releaseDate: 'asc' },
        });
        break;
      case ParkingReportType.ALLOCATIONS:
        data = await this.prisma.parkingAllocation.findMany({
          where: { parkingRelease: { releaseDate: dateRange } },
          include: {
            employee: true,
            parkingRelease: {
              include: {
                parkingAssignment: {
                  include: { parkingSpace: { include: { parkingFloor: true } }, employee: true },
                },
              },
            },
          },
          orderBy: { allocatedAt: 'asc' },
        });
        break;
      default:
        throw new BadRequestException('Unsupported report type');
    }

    return { reportType, startDate, endDate, data };
  }

  private parseCalendarDate(value: string, field: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${field} must be a valid calendar date`);
    }
    return date;
  }

  private assertIanaTimeZone(timeZone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
      throw new BadRequestException('officeTimeZone must be a valid IANA time-zone identifier');
    }
  }
}
