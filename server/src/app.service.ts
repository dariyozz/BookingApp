import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Prisma } from './generated/prisma/client.js';
import { addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from './prisma.service.js';
import { parseSkopjeLocal, SCHEDULING_TIME_ZONE } from './time-zone.js';

type SlotEntity = {
  id: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  status: 'AVAILABLE' | 'BOOKED' | 'CANCELLED';
  isDemoData: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type BookingEntity = {
  id: string;
  slotId: string;
  visitorName: string;
  visitorEmail: string;
  note: string | null;
  status: 'CONFIRMED' | 'CANCELLED';
  createdAt: Date;
  isDemoData: boolean;
};

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      ok: true,
      service: 'teamlift-scheduler',
      timezone: SCHEDULING_TIME_ZONE,
      database: 'connected',
      generatedAt: new Date().toISOString(),
    };
  }

  async listPublicSlots(dateFilter?: string) {
    const now = new Date();
    const where: Prisma.SlotWhereInput = {
      status: 'AVAILABLE',
      startAt: { gt: now, lte: addDays(now, 30) },
    };

    if (dateFilter !== undefined) {
      let dayStart: Date;
      let dayEnd: Date;
      try {
        dayStart = parseSkopjeLocal(dateFilter, '00:00');
        const [year, month, day] = dateFilter.split('-').map(Number);
        const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
        const nextDateString = [
          nextDate.getUTCFullYear().toString().padStart(4, '0'),
          (nextDate.getUTCMonth() + 1).toString().padStart(2, '0'),
          nextDate.getUTCDate().toString().padStart(2, '0'),
        ].join('-');
        dayEnd = parseSkopjeLocal(nextDateString, '00:00');
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'The requested date is invalid.',
        );
      }
      where.startAt = { gte: dayStart, lt: dayEnd };
      where.startAt.gt = now;
      where.startAt.lte = addDays(now, 30);
    }

    const slots = await this.prisma.slot.findMany({
      where,
      orderBy: { startAt: 'asc' },
    });
    return slots.map((slot) => this.toSlotRecord(slot));
  }

  async getHostSlots() {
    const slots = await this.prisma.slot.findMany({ orderBy: { startAt: 'asc' } });
    return slots.map((slot) => this.toSlotRecord(slot));
  }

  async getDashboard() {
    const [slots, bookings] = await Promise.all([
      this.prisma.slot.findMany({ orderBy: { startAt: 'asc' } }),
      this.prisma.booking.findMany({ orderBy: { createdAt: 'desc' } }),
    ]);
    const now = new Date();
    const upcomingSlots = slots.filter(
      (slot) => slot.startAt > now && slot.status !== 'CANCELLED',
    );
    const upcomingBookings = bookings.filter(
      (booking) =>
        booking.status === 'CONFIRMED' &&
        slots.some((slot) => slot.id === booking.slotId && slot.startAt > now),
    );

    return {
      summary: {
        totalSlots: slots.length,
        upcomingSlots: upcomingSlots.length,
        availableSlots: upcomingSlots.filter((slot) => slot.status === 'AVAILABLE').length,
        upcomingBookings: upcomingBookings.length,
        cancelledBookings: bookings.filter((booking) => booking.status === 'CANCELLED').length,
      },
      slots: slots.map((slot) => this.toSlotRecord(slot)),
      bookings: bookings.map((booking) => this.toBookingRecord(booking)),
      upcomingActivity: upcomingSlots.slice(0, 6).map((slot) => ({
        id: slot.id,
        title: slot.status === 'AVAILABLE' ? 'Open slot' : 'Booked slot',
        date: formatInTimeZone(slot.startAt, SCHEDULING_TIME_ZONE, 'EEE, d MMM'),
        time: `${formatInTimeZone(slot.startAt, SCHEDULING_TIME_ZONE, 'HH:mm')} – ${formatInTimeZone(slot.endAt, SCHEDULING_TIME_ZONE, 'HH:mm')}`,
      })),
    };
  }

  async createHostSlot(payload: Record<string, unknown>) {
    this.assertObjectPayload(payload);
    const { startAt, durationMinutes } = this.validateSlotInput(
      payload.date,
      payload.startTime,
      payload.durationMinutes ?? payload.duration ?? 30,
    );
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (await this.hasOverlap(tx, startAt, endAt)) {
          throw new ConflictException('This slot overlaps an active slot.');
        }
        const slot = await tx.slot.create({
          data: {
            startAt,
            endAt,
            durationMinutes,
            isDemoData: false,
          },
        });
        return this.toSlotRecord(slot);
      });
    } catch (error) {
      this.rethrowSlotOverlap(error);
    }
  }

  async updateHostSlot(slotId: string, payload: Record<string, unknown>) {
    this.assertObjectPayload(payload);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.slot.findUnique({ where: { id: slotId } });
        if (!current) throw new NotFoundException('Slot not found.');
        if (current.status !== 'AVAILABLE') {
          throw new ConflictException(
            'Only available slots can be edited. Cancel a booked slot and create a replacement instead.',
          );
        }

        const date =
          typeof payload.date === 'string'
            ? payload.date
            : formatInTimeZone(current.startAt, SCHEDULING_TIME_ZONE, 'yyyy-MM-dd');
        const startTime =
          typeof payload.startTime === 'string'
            ? payload.startTime
            : formatInTimeZone(current.startAt, SCHEDULING_TIME_ZONE, 'HH:mm');
        const { startAt, durationMinutes } = this.validateSlotInput(
          date,
          startTime,
          payload.durationMinutes ?? current.durationMinutes,
        );
        const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

        if (await this.hasOverlap(tx, startAt, endAt, slotId)) {
          throw new ConflictException('The requested time overlaps an existing active slot.');
        }

        const updateResult = await tx.slot.updateMany({
          where: { id: slotId, status: 'AVAILABLE' },
          data: { startAt, endAt, durationMinutes },
        });
        if (updateResult.count !== 1) {
          throw new ConflictException('This slot changed while it was being edited. Refresh and try again.');
        }

        const updated = await tx.slot.findUniqueOrThrow({ where: { id: slotId } });
        return this.toSlotRecord(updated);
      });
    } catch (error) {
      this.rethrowSlotOverlap(error);
    }
  }

  async cancelHostSlot(slotId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const slot = await tx.slot.findUnique({ where: { id: slotId } });
        if (!slot) throw new NotFoundException('Slot not found.');
        if (slot.status === 'CANCELLED') {
          throw new ConflictException('This slot is already cancelled.');
        }

        await tx.slot.update({
          where: { id: slotId },
          data: { status: 'CANCELLED' },
        });
        await tx.booking.updateMany({
          where: { slotId, status: 'CONFIRMED' },
          data: { status: 'CANCELLED' },
        });

        let replacement: SlotEntity | null = null;
        if (slot.startAt > new Date()) {
          const overlaps = await this.hasOverlap(tx, slot.startAt, slot.endAt, slotId);
          if (!overlaps) {
            replacement = await tx.slot.create({
              data: {
                startAt: slot.startAt,
                endAt: slot.endAt,
                durationMinutes: slot.durationMinutes,
                isDemoData: false,
              },
            });
          }
        }

        return {
          message: 'Slot and any confirmed booking were cancelled and retained in history.',
          slot: this.toSlotRecord({ ...slot, status: 'CANCELLED', updatedAt: new Date() }),
          replacementSlot: replacement ? this.toSlotRecord(replacement) : null,
        };
      });
    } catch (error) {
      this.rethrowSlotOverlap(error);
    }
  }

  async cancelBooking(bookingId: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { slot: true },
      });
      if (!booking) throw new NotFoundException('Booking not found.');
      if (booking.status === 'CANCELLED') {
        throw new ConflictException('This booking is already cancelled.');
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      });

      let reopenedSlot: SlotEntity | null = null;
      if (booking.slot.status === 'BOOKED' && booking.slot.startAt > new Date()) {
        const overlaps = await this.hasOverlap(
          tx,
          booking.slot.startAt,
          booking.slot.endAt,
          booking.slot.id,
        );
        if (!overlaps) {
          const result = await tx.slot.updateMany({
            where: { id: booking.slot.id, status: 'BOOKED' },
            data: { status: 'AVAILABLE' },
          });
          if (result.count === 1) {
            reopenedSlot = await tx.slot.findUniqueOrThrow({
              where: { id: booking.slot.id },
            });
          }
        }
      }

      return {
        id: booking.id,
        status: 'CANCELLED',
        reopenedSlot: reopenedSlot ? this.toSlotRecord(reopenedSlot) : null,
      };
    });
  }

  async createBooking(payload: Record<string, unknown>) {
    this.assertObjectPayload(payload);
    const slotId = this.readRequiredText(payload.slotId, 'A slot is required.');
    const visitorName = this.readRequiredText(payload.visitorName, 'Name and email are required.');
    const visitorEmail = this.readRequiredText(payload.visitorEmail, 'Name and email are required.');
    const note =
      typeof payload.note === 'string' && payload.note.trim()
        ? payload.note.trim().slice(0, 2000)
        : null;

    if (visitorName.length > 200) {
      throw new BadRequestException('Name must be 200 characters or fewer.');
    }
    if (!this.isValidEmail(visitorEmail)) {
      throw new BadRequestException('Please enter a valid email address.');
    }
    if (visitorEmail.length > 320) {
      throw new BadRequestException('Email address is too long.');
    }

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.slot.updateMany({
        where: {
          id: slotId,
          status: 'AVAILABLE',
          startAt: { gt: new Date() },
        },
        data: { status: 'BOOKED' },
      });
      if (claim.count !== 1) {
        const slot = await tx.slot.findUnique({ where: { id: slotId } });
        if (!slot) throw new NotFoundException('This slot could not be found.');
        if (slot.startAt <= new Date()) {
          throw new ConflictException('This slot has already passed.');
        }
        throw new ConflictException('This slot is no longer available. Please choose another time.');
      }

      const [slot, booking] = await Promise.all([
        tx.slot.findUniqueOrThrow({ where: { id: slotId } }),
        tx.booking.create({
          data: {
            slotId,
            visitorName,
            visitorEmail,
            note,
          },
        }),
      ]);

      return {
        booking: this.toBookingRecord(booking),
        slot: this.toSlotRecord(slot),
        confirmationMessage: this.getFallbackConfirmation(visitorName),
      };
    });
  }

  async generateConfirmationMessage(body: Record<string, unknown>) {
    this.assertObjectPayload(body);
    const slotId = typeof body.slotId === 'string' ? body.slotId : '';
    const firstName =
      typeof body.firstName === 'string' && body.firstName.trim()
        ? body.firstName.trim().slice(0, 80)
        : 'friend';
    const slot = slotId
      ? await this.prisma.slot.findUnique({ where: { id: slotId } })
      : null;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!slot || !apiKey) {
      return {
        message: this.getFallbackConfirmation(firstName),
        source: 'fallback' as const,
      };
    }

    const modelName = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      const response = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Write a friendly, concise confirmation for a virtual coffee chat with Dario Jakovleski. Visitor first name: ${firstName}. Appointment time: ${formatInTimeZone(slot.startAt, SCHEDULING_TIME_ZONE, 'EEE, d MMM yyyy • HH:mm')} Europe/Skopje (Skopje time). Do not mention email or meeting-link delivery. Keep it under 2 sentences.`,
              },
            ],
          },
        ],
      });
      const text = response.response.text();
      const message = text ? this.sanitizeGeminiText(text) : '';
      return message
        ? { message, source: 'gemini' as const }
        : { message: this.getFallbackConfirmation(firstName), source: 'fallback' as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown provider error.';
      const safeMessage = apiKey ? message.split(apiKey).join('[REDACTED]') : message;
      console.error(
        `[Gemini confirmation] ${modelName} request failed; using fallback: ${safeMessage}`,
      );
      return {
        message: this.getFallbackConfirmation(firstName),
        source: 'fallback' as const,
      };
    }
  }

  getFallbackConfirmation(firstName: string) {
    return `Thanks, ${firstName}! Your virtual coffee chat with Dario Jakovleski is booked. We’ll share the meeting link separately before the session.`;
  }

  private validateSlotInput(dateValue: unknown, timeValue: unknown, durationValue: unknown) {
    if (typeof dateValue !== 'string' || typeof timeValue !== 'string') {
      throw new BadRequestException('A date and start time are required.');
    }
    const durationMinutes = Number(durationValue);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 180) {
      throw new BadRequestException('Duration must be a whole number between 15 and 180 minutes.');
    }

    let startAt: Date;
    try {
      startAt = parseSkopjeLocal(dateValue, timeValue);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'The selected time is invalid in Europe/Skopje.',
      );
    }
    if (startAt <= new Date()) {
      throw new BadRequestException('New slots must start in the future.');
    }

    return { startAt, durationMinutes };
  }

  private async hasOverlap(
    tx: Prisma.TransactionClient,
    startAt: Date,
    endAt: Date,
    ignoreId?: string,
  ) {
    const overlap = await tx.slot.findFirst({
      where: {
        status: { not: 'CANCELLED' },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    return overlap !== null;
  }

  private rethrowSlotOverlap(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Slot_no_active_overlap')) {
      throw new ConflictException('This slot overlaps an active slot.');
    }
    throw error;
  }

  private readRequiredText(value: unknown, errorMessage: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(errorMessage);
    }
    return value.trim();
  }

  private assertObjectPayload(payload: unknown): asserts payload is Record<string, unknown> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('A JSON object is required.');
    }
  }

  private isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private sanitizeGeminiText(value: string) {
    return value.replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  private toSlotRecord(slot: SlotEntity) {
    return {
      ...slot,
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      createdAt: slot.createdAt.toISOString(),
      updatedAt: slot.updatedAt.toISOString(),
    };
  }

  private toBookingRecord(booking: BookingEntity) {
    return {
      ...booking,
      note: booking.note ?? undefined,
      createdAt: booking.createdAt.toISOString(),
    };
  }
}
