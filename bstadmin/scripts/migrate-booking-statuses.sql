-- Booking status migration helper (PostgreSQL)
-- Map old statuses to new flow, then run status sync.

-- Old -> New mapping
UPDATE bookings SET status = 'NEW' WHERE status = 'PENDING';
UPDATE bookings SET status = 'READY' WHERE status = 'CONFIRMED';
UPDATE bookings SET status = 'DONE' WHERE status = 'COMPLETED';
UPDATE bookings SET status = 'UPDATED' WHERE status = 'UPDATED';
UPDATE bookings SET status = 'CANCELLED' WHERE status = 'CANCELLED';
UPDATE bookings SET status = 'NO_SHOW' WHERE status = 'NO_SHOW';

-- After this, call the sync endpoint:
-- POST /api/settings/sync-booking-status
