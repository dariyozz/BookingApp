CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'CANCELLED');
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Slot_valid_interval" CHECK ("endAt" > "startAt"),
    CONSTRAINT "Slot_valid_duration" CHECK ("durationMinutes" BETWEEN 15 AND 180),
    CONSTRAINT "Slot_no_active_overlap" EXCLUDE USING gist (
        tstzrange("startAt", "endAt", '[)') WITH &&
    ) WHERE ("status" <> 'CANCELLED')
);

CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "visitorEmail" TEXT NOT NULL,
    "note" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Slot_startAt_idx"
    ON "Slot"("startAt");

CREATE INDEX "Slot_status_idx"
    ON "Slot"("status");

CREATE INDEX "Booking_slotId_idx"
    ON "Booking"("slotId");

CREATE INDEX "Booking_visitorEmail_idx"
    ON "Booking"("visitorEmail");

CREATE INDEX "Booking_status_idx"
    ON "Booking"("status");

CREATE UNIQUE INDEX "Booking_one_confirmed_per_slot_idx"
    ON "Booking"("slotId")
    WHERE "status" = 'CONFIRMED';

DO $$
BEGIN
    IF to_regclass('public.slots') IS NOT NULL
       AND to_regclass('public.bookings') IS NOT NULL THEN
        INSERT INTO "Slot" (
            "id",
            "startAt",
            "endAt",
            "durationMinutes",
            "status",
            "isDemoData",
            "createdAt",
            "updatedAt"
        )
        SELECT
            legacy_slot."id",
            (legacy_slot."date" || ' ' || legacy_slot."startTime")::TIMESTAMP
                AT TIME ZONE 'Europe/Skopje',
            ((legacy_slot."date" || ' ' || legacy_slot."startTime")::TIMESTAMP
                AT TIME ZONE 'Europe/Skopje')
                + legacy_slot."duration" * INTERVAL '1 minute',
            legacy_slot."duration",
            CASE
                WHEN legacy_slot."isBooked" THEN 'BOOKED'::"SlotStatus"
                ELSE 'AVAILABLE'::"SlotStatus"
            END,
            false,
            legacy_slot."createdAt" AT TIME ZONE 'UTC',
            legacy_slot."updatedAt" AT TIME ZONE 'UTC'
        FROM public.slots AS legacy_slot
        ON CONFLICT ("id") DO NOTHING;

        INSERT INTO "Booking" (
            "id",
            "slotId",
            "visitorName",
            "visitorEmail",
            "note",
            "status",
            "isDemoData",
            "createdAt",
            "updatedAt"
        )
        SELECT
            legacy_booking."id",
            legacy_booking."slotId",
            legacy_booking."guestName",
            legacy_booking."guestEmail",
            NULLIF(legacy_booking."message", ''),
            CASE
                WHEN legacy_slot."isBooked" THEN 'CONFIRMED'::"BookingStatus"
                ELSE 'CANCELLED'::"BookingStatus"
            END,
            false,
            legacy_booking."createdAt" AT TIME ZONE 'UTC',
            legacy_booking."createdAt" AT TIME ZONE 'UTC'
        FROM public.bookings AS legacy_booking
        JOIN public.slots AS legacy_slot
          ON legacy_slot."id" = legacy_booking."slotId"
        ON CONFLICT ("id") DO NOTHING;
    END IF;
END $$;
