import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  updatedAt: Date;
};

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const users = new Map<string, StoredUser>();

  const prisma = {
    user: {
      findUnique: jest.fn(
        (args: { where: { email?: string; id?: string } }) => {
          if (args.where.email) {
            return Promise.resolve(
              [...users.values()].find((user) => user.email === args.where.email) ??
                null,
            );
          }
          if (args.where.id) {
            return Promise.resolve(users.get(args.where.id) ?? null);
          }
          return Promise.resolve(null);
        },
      ),
      create: jest.fn(
        (args: {
          data: {
            email: string;
            passwordHash: string;
            firstName: string;
            lastName: string;
          };
        }) => {
          const user: StoredUser = {
            id: crypto.randomUUID(),
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          users.set(user.id, user);
          return Promise.resolve(user);
        },
      ),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => {
    users.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an invalid register payload', () => {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', role: 'admin' })
      .expect(400);
  });

  it('registers, logs in, and returns the current user without passwordHash', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'Ana@Example.com',
        password: 'password123',
        firstName: 'Ana',
        lastName: 'López',
      })
      .expect(201);

    expect(registered.body.accessToken).toEqual(expect.any(String));
    expect(registered.body.user.email).toBe('ana@example.com');
    expect(registered.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(registered.body)).not.toContain('passwordHash');

    const loggedIn = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'password123' })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loggedIn.body.accessToken}`)
      .expect(200);

    expect(me.body).toMatchObject({
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'López',
    });
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate email', async () => {
    const payload = {
      email: 'ana@example.com',
      password: 'password123',
      firstName: 'Ana',
      lastName: 'López',
    };

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(payload)
      .expect(409);
  });

  it('rejects invalid credentials and missing tokens', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'missing@example.com', password: 'password123' })
      .expect(401);

    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('requires a session for reports, alerts and the closing email', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    await request(app.getHttpServer()).get(`/api/reports/portfolios/${id}/pdf`).expect(401);
    await request(app.getHttpServer()).get(`/api/reports/portfolios/${id}/xlsx`).expect(401);
    await request(app.getHttpServer()).get('/api/alerts').expect(401);
    await request(app.getHttpServer()).post('/api/notifications/daily-report').expect(401);
  });
});
