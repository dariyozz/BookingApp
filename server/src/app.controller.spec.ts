import { ConflictException } from '@nestjs/common';
import { formatInTimeZone } from 'date-fns-tz';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma.service.js';
import { parseSkopjeLocal, SCHEDULING_TIME_ZONE } from './time-zone.js';

const { generateContentMock, getGenerativeModelMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  getGenerativeModelMock: vi.fn(() => ({ generateContent: generateContentMock })),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(options: { model: string }) {
      return getGenerativeModelMock(options);
    }
  },
}));

function createPrismaMock() {
  const slots: any[] = [];
  const bookings: any[] = [];
  let nextId = 0;
  const matches = (slot: any, where: any = {}) => {
    if (where.id && typeof where.id === 'string' && slot.id !== where.id) return false;
    if (where.id?.not && slot.id === where.id.not) return false;
    if (where.status && typeof where.status === 'string' && slot.status !== where.status) return false;
    if (where.status?.not && slot.status === where.status.not) return false;
    if (where.startAt?.gt && slot.startAt <= where.startAt.gt) return false;
    if (where.startAt?.gte && slot.startAt < where.startAt.gte) return false;
    if (where.startAt?.lt && slot.startAt >= where.startAt.lt) return false;
    if (where.startAt?.lte && slot.startAt > where.startAt.lte) return false;
    if (where.endAt?.gt && slot.endAt <= where.endAt.gt) return false;
    if (where.endAt?.lt && slot.endAt >= where.endAt.lt) return false;
    return true;
  };
  let prisma: any;
  prisma = {
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(prisma)),
    slot: {
      findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
        const result = slots.filter((slot) => matches(slot, where));
        return orderBy?.startAt === 'asc'
          ? [...result].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
          : result;
      }),
      findFirst: vi.fn(async ({ where }: any) => slots.find((slot) => matches(slot, where)) ?? null),
      findUnique: vi.fn(async ({ where }: any) => slots.find((slot) => slot.id === where.id) ?? null),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        const slot = slots.find((item) => item.id === where.id);
        if (!slot) throw new Error('Record not found.');
        return slot;
      }),
      create: vi.fn(async ({ data }: any) => {
        const now = new Date();
        const slot = {
          id: `slot_${++nextId}`,
          status: 'AVAILABLE',
          isDemoData: false,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        slots.push(slot);
        return slot;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const slot = slots.find((item) => item.id === where.id && matches(item, where));
        if (!slot) return { count: 0 };
        Object.assign(slot, data, { updatedAt: new Date() });
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const slot = slots.find((item) => item.id === where.id);
        if (!slot) throw new Error('Record not found.');
        Object.assign(slot, data, { updatedAt: new Date() });
        return slot;
      }),
    },
    booking: {
      findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
        const result = bookings.filter((booking) => !where?.status || booking.status === where.status);
        return orderBy?.createdAt === 'desc'
          ? [...result].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          : result;
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const booking = bookings.find((item) => item.id === where.id);
        if (!booking) return null;
        return include?.slot
          ? { ...booking, slot: slots.find((item) => item.id === booking.slotId) }
          : booking;
      }),
      create: vi.fn(async ({ data }: any) => {
        const booking = {
          id: `booking_${++nextId}`,
          status: 'CONFIRMED',
          isDemoData: false,
          createdAt: new Date(),
          note: null,
          ...data,
        };
        bookings.push(booking);
        return booking;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matching = bookings.filter(
          (item) =>
            (!where.slotId || item.slotId === where.slotId) &&
            (!where.status || item.status === where.status),
        );
        matching.forEach((booking) => Object.assign(booking, data, { updatedAt: new Date() }));
        return { count: matching.length };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const booking = bookings.find((item) => item.id === where.id);
        if (!booking) throw new Error('Record not found.');
        Object.assign(booking, data, { updatedAt: new Date() });
        return booking;
      }),
      count: vi.fn(async ({ where }: any = {}) =>
        bookings.filter(
          (booking) =>
            (!where?.slotId || booking.slotId === where.slotId) &&
            (where?.isDemoData === undefined || booking.isDemoData === where.isDemoData),
        ).length,
      ),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = bookings.length;
        for (let i = bookings.length - 1; i >= 0; i -= 1) {
          if (bookings[i].isDemoData === where.isDemoData) bookings.splice(i, 1);
        }
        return { count: before - bookings.length };
      }),
    },
  };
  return { prisma, slots, bookings };
}

function dateAfter(days: number) {
  return formatInTimeZone(
    new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    SCHEDULING_TIME_ZONE,
    'yyyy-MM-dd',
  );
}

describe('AppService with mocked PostgreSQL client', () => {
  let service: AppService;
  let slots: any[];
  let bookings: any[];

  beforeEach(() => {
    const mock = createPrismaMock();
    slots = mock.slots;
    bookings = mock.bookings;
    service = new AppService(mock.prisma as PrismaService);
  });

  it('creates a valid slot and rejects invalid duration and overlap', async () => {
    const date = dateAfter(5);
    const slot = await service.createHostSlot({ date, startTime: '09:30', durationMinutes: 45 });
    expect(slot.status).toBe('AVAILABLE');
    expect(slot.durationMinutes).toBe(45);
    await expect(
      service.createHostSlot({ date, startTime: '10:00', durationMinutes: 45 }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.createHostSlot({ date, startTime: '12:00', durationMinutes: 5 }),
    ).rejects.toThrow('Duration must be a whole number');
  });

  it('books an available slot once and rejects a concurrent duplicate', async () => {
    const slot = await service.createHostSlot({
      date: dateAfter(5),
      startTime: '17:00',
      durationMinutes: 60,
    });
    const results = await Promise.allSettled([
      service.createBooking({
        slotId: slot.id,
        visitorName: 'Ava',
        visitorEmail: 'ava@example.com',
      }),
      service.createBooking({
        slotId: slot.id,
        visitorName: 'Noah',
        visitorEmail: 'noah@example.com',
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(bookings).toHaveLength(1);
    expect(slots[0].status).toBe('BOOKED');
  });

  it('cancels a booking and reopens its future slot without deleting history', async () => {
    const slot = await service.createHostSlot({
      date: dateAfter(5),
      startTime: '14:00',
      durationMinutes: 45,
    });
    const result = await service.createBooking({
      slotId: slot.id,
      visitorName: 'Lena',
      visitorEmail: 'lena@example.com',
    });
    await service.cancelBooking(result.booking.id);
    expect(slots[0].status).toBe('AVAILABLE');
    expect(bookings).toHaveLength(1);
    expect(bookings[0].status).toBe('CANCELLED');
  });

  it('cancels a booked slot and creates distinct replacement availability', async () => {
    const slot = await service.createHostSlot({
      date: dateAfter(5),
      startTime: '11:00',
      durationMinutes: 30,
    });
    await service.createBooking({
      slotId: slot.id,
      visitorName: 'Sam',
      visitorEmail: 'sam@example.com',
    });
    const result = await service.cancelHostSlot(slot.id);
    expect(slots).toHaveLength(2);
    expect(slots[0].status).toBe('CANCELLED');
    expect(slots[1].status).toBe('AVAILABLE');
    expect(slots[1].id).not.toBe(slots[0].id);
    expect(bookings[0].status).toBe('CANCELLED');
    expect(result.replacementSlot?.id).toBe(slots[1].id);
  });

  it('rejects nonexistent and ambiguous Skopje daylight-saving times', () => {
    expect(() => parseSkopjeLocal('2026-03-29', '02:30')).toThrow('does not exist');
    expect(() => parseSkopjeLocal('2026-10-25', '02:30')).toThrow('ambiguous');
    expect(parseSkopjeLocal('2026-03-29', '03:30').toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('returns a deterministic confirmation without Gemini', async () => {
    const confirmation = await service.generateConfirmationMessage({
      slotId: 'not-present',
      firstName: 'Chris',
    });
    expect(confirmation.source).toBe('fallback');
    expect(confirmation.message).toContain('Chris');
    expect(confirmation.message).toContain('meeting link separately');
  });

  it('uses Gemini and identifies a generated confirmation', async () => {
    const previousApiKey = process.env.GEMINI_API_KEY;
    const previousModel = process.env.GEMINI_MODEL;
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GEMINI_MODEL = 'gemini-test-model';
    generateContentMock.mockResolvedValue({
      response: { text: () => 'A generated confirmation.' },
    });

    try {
      const slot = await service.createHostSlot({
        date: dateAfter(5),
        startTime: '16:00',
        durationMinutes: 30,
      });
      const confirmation = await service.generateConfirmationMessage({
        slotId: slot.id,
        firstName: 'Riley',
      });

      expect(getGenerativeModelMock).toHaveBeenCalledWith({
        model: 'gemini-test-model',
      });
      expect(generateContentMock).toHaveBeenCalledOnce();
      expect(confirmation).toEqual({
        message: 'A generated confirmation.',
        source: 'gemini',
      });
    } finally {
      if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousApiKey;
      if (previousModel === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = previousModel;
      generateContentMock.mockReset();
      getGenerativeModelMock.mockReset();
    }
  });
});
