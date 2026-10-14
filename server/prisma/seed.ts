import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { formatInTimeZone } from 'date-fns-tz';
import { BookingStatus, PrismaClient, SlotStatus } from '../src/generated/prisma/client.js';
import { parseSkopjeLocal, SCHEDULING_TIME_ZONE } from '../src/time-zone.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed demo data.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function localDateAfter(days: number) {
  const today = formatInTimeZone(new Date(), SCHEDULING_TIME_ZONE, 'yyyy-MM-dd');
  const [year, month, day] = today.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear().toString().padStart(4, '0'),
    (date.getUTCMonth() + 1).toString().padStart(2, '0'),
    date.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

async function main() {
  const existingDemoCount = await prisma.slot.count({ where: { isDemoData: true } });
  if (existingDemoCount > 0) {
    console.log('Demo slots already exist. No seed performed.');
    return;
  }

  const fixtures = [
    { offset: 1, time: '09:30', duration: 45, status: SlotStatus.AVAILABLE },
    { offset: 2, time: '12:15', duration: 30, status: SlotStatus.BOOKED },
    { offset: 4, time: '15:00', duration: 60, status: SlotStatus.AVAILABLE },
    { offset: 7, time: '10:00', duration: 45, status: SlotStatus.CANCELLED },
    { offset: 9, time: '17:30', duration: 30, status: SlotStatus.AVAILABLE },
  ];

  await prisma.$transaction(async (tx) => {
    for (const fixture of fixtures) {
      const startAt = parseSkopjeLocal(localDateAfter(fixture.offset), fixture.time);
      const slot = await tx.slot.create({
        data: {
          startAt,
          endAt: new Date(startAt.getTime() + fixture.duration * 60_000),
          durationMinutes: fixture.duration,
          status: fixture.status,
          isDemoData: true,
        },
      });

      if (fixture.status === SlotStatus.BOOKED) {
        await tx.booking.create({
          data: {
            slotId: slot.id,
            visitorName: 'Mila Petrovska',
            visitorEmail: 'mila@example.com',
            note: 'Product strategy chat',
            status: BookingStatus.CONFIRMED,
            isDemoData: true,
          },
        });
      }
    }
  });

  console.log(`Seeded ${fixtures.length} explicitly marked demo slots.`);
}

main()
  .catch((error: unknown) => {
    console.error('Demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
