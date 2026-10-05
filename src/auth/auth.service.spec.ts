import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let passwordHash: string;

  const usersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn(),
  };

  const registerInput = {
    email: 'Ana@Example.com',
    password: 'password123',
    firstName: ' Ana ',
    lastName: ' López ',
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('password123', 10);
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    jwtService.sign.mockReturnValue('signed-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  function buildUser(overrides: Partial<User> = {}): User {
    return {
      id: 'user-1',
      email: 'ana@example.com',
      passwordHash,
      firstName: 'Ana',
      lastName: 'López',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  it('registers a user and omits passwordHash', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockImplementation(
      (data: {
        email: string;
        passwordHash: string;
        firstName: string;
        lastName: string;
      }) => Promise.resolve(buildUser(data)),
    );

    const result = await service.register(registerInput);

    expect(usersService.findByEmail).toHaveBeenCalledWith('ana@example.com');
    const created = usersService.create.mock.calls[0][0] as {
      email: string;
      passwordHash: string;
      firstName: string;
      lastName: string;
    };
    expect(created).toMatchObject({
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'López',
    });
    expect(created.passwordHash).not.toBe(registerInput.password);
    await expect(
      bcrypt.compare(registerInput.password, created.passwordHash),
    ).resolves.toBe(true);
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'ana@example.com',
    });
    expect(result.accessToken).toBe('signed-token');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('rejects a duplicate email', async () => {
    usersService.findByEmail.mockResolvedValue(buildUser());

    await expect(service.register(registerInput)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('maps a unique constraint failure to a conflict', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await expect(service.register(registerInput)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('logs in with valid credentials', async () => {
    usersService.findByEmail.mockResolvedValue(buildUser());

    const result = await service.login({
      email: 'Ana@Example.com',
      password: 'password123',
    });

    expect(result.accessToken).toBe('signed-token');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects unknown users and bad passwords with the same error', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    await expect(
      service.login({ email: 'ana@example.com', password: 'password123' }),
    ).rejects.toThrow(new UnauthorizedException('Credenciales inválidas'));

    usersService.findByEmail.mockResolvedValue(buildUser());
    await expect(
      service.login({ email: 'ana@example.com', password: 'wrong-pass' }),
    ).rejects.toThrow(new UnauthorizedException('Credenciales inválidas'));
  });

  it('returns the current profile without passwordHash', async () => {
    usersService.findById.mockResolvedValue(
      buildUser({ passwordHash: 'secret-hash' }),
    );

    const profile = await service.me('user-1');

    expect(profile).toEqual({
      id: 'user-1',
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'López',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(profile).not.toHaveProperty('passwordHash');
  });

  it('rejects me when the user no longer exists', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(service.me('missing')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
