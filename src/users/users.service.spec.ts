import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('finds a user by email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(service.findByEmail('ana@example.com')).resolves.toEqual({
      id: 'user-1',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'ana@example.com' },
    });
  });

  it('creates a user', async () => {
    const data = {
      email: 'ana@example.com',
      passwordHash: 'hash',
      firstName: 'Ana',
      lastName: 'López',
    };
    prisma.user.create.mockResolvedValue({ id: 'user-1', ...data });

    await expect(service.create(data)).resolves.toMatchObject(data);
    expect(prisma.user.create).toHaveBeenCalledWith({ data });
  });
});
