import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to clean demo data.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const demoBookingDelete = await tx.booking.deleteMany({
      where: { isDemoData: true },
    });
    const demoSlots = await tx.slot.findMany({
      where: { isDemoData: true },
      select: { id: true },
    });

    let deletedSlots = 0;
    let preservedSlots = 0;
    for (const slot of demoSlots) {
      const genuineBookings = await tx.booking.count({
        where: { slotId: slot.id, isDemoData: false },
      });
      if (genuineBookings > 0) {
        await tx.slot.update({
          where: { id: slot.id },
          data: { isDemoData: false },
        });
        preservedSlots += 1;
      } else {
        await tx.slot.delete({ where: { id: slot.id } });
        deletedSlots += 1;
      }
    }

    return {
      deletedDemoBookings: demoBookingDelete.count,
      deletedDemoSlots: deletedSlots,
      preservedSlotsWithGenuineBookings: preservedSlots,
    };
  });

  console.log('Demo cleanup complete:', result);
}

main()
  .catch((error: unknown) => {
    console.error('Demo cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
