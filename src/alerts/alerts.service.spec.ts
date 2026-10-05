import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from './alerts.service';

describe('AlertsService', () => {
  const prisma = { alert: { deleteMany: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() } };
  const service = new AlertsService(
    prisma as unknown as PrismaService,
    { requireOwned: jest.fn() } as never,
    {} as never,
    {} as never,
    { send: jest.fn() } as never,
  );

  it('does not delete an alert owned by someone else', async () => {
    prisma.alert.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('user-1', 'alert-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.alert.deleteMany).toHaveBeenCalledWith({
      where: { id: 'alert-1', userId: 'user-1' },
    });
  });
});
