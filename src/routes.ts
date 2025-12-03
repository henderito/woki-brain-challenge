import {
    DiscoverQuerySchema,
    CreateBookingSchema,
    ListBookingsQuerySchema
} from './schemas';
import { findCandidates, selectBestCandidate } from './domain/wokibrain';
import { getDurationForPartySize } from './domain/wokibrain';
import type { Booking } from './types';

import store from './store/db';

/**
 * Discover available seating candidates for a party
 * 
 * Finds single tables and table combinations that can accommodate a party
 * within the specified time window. Returns candidates sorted by the selection strategy.
 * 
 * @param request - Fastify request with query parameters:
 *   - restaurantId: Restaurant identifier
 *   - sectorId: Sector identifier
 *   - date: Booking date (YYYY-MM-DD format)
 *   - partySize: Number of people in the party
 *   - windowStart: Optional start time (HH:mm)
 *   - windowEnd: Optional end time (HH:mm)
 *   - limit: Optional max candidates to return (default: 10)
 * @param reply - Fastify reply object
 * @returns Object with slotMinutes (15), durationMinutes, and candidates array
 * 
 * @throws {400} Invalid input (malformed query parameters)
 * @throws {404} Restaurant or sector not found
 * @throws {409} No capacity available within the time window
 */
export const discover = async (request, reply) => {
    const query = DiscoverQuerySchema.safeParse(request.query);
    if (!query.success) {
        return reply.status(400).send({ error: 'invalid_input', detail: query.error.format() });
    }
    const { restaurantId, sectorId, date, partySize, windowStart, windowEnd } = query.data;

    // B1: Calculate duration based on party size
    const duration = getDurationForPartySize(partySize);

    const restaurant = store.getRestaurant(restaurantId);
    if (!restaurant) return reply.status(404).send({ error: 'not_found', detail: 'Restaurant not found' });

    const sector = store.getSector(sectorId);
    if (!sector) return reply.status(404).send({ error: 'not_found', detail: 'Sector not found' });

    const tables = store.getTables(sectorId);
    const bookings = store.getAllBookings();

    let searchWindows = restaurant.windows || [];
    if (windowStart && windowEnd) {
        searchWindows = [{ start: windowStart, end: windowEnd }];
    }

    const candidates = findCandidates(tables, bookings, date, partySize, duration, searchWindows);

    if (candidates.length === 0) {
        return reply.status(409).send({ error: 'no_capacity', detail: 'No single or combo gap fits duration within window' });
    }

    return {
        slotMinutes: 15,
        durationMinutes: duration,
        candidates: candidates.slice(0, query.data.limit || 10)
    };
}

/**
 * Create a new booking for a party
 * 
 * Atomically finds the best available seating option and creates a booking.
 * Supports idempotency to prevent duplicate bookings using the Idempotency-Key header.
 * Uses optimistic locking to handle concurrent booking requests.
 * 
 * @param request - Fastify request with:
 *   - headers.idempotency-key: Optional unique key for idempotent requests
 *   - body:
 *     - restaurantId: Restaurant identifier
 *     - sectorId: Sector identifier
 *     - partySize: Number of people
 *     - date: Booking date (YYYY-MM-DD)
 *     - windowStart: Optional start time (HH:mm)
 *     - windowEnd: Optional end time (HH:mm)
 * @param reply - Fastify reply object
 * @returns Created booking object with id, tableIds, start/end times, and status
 * 
 * @throws {200} Idempotent request - returns existing booking
 * @throws {400} Invalid input
 * @throws {404} Restaurant not found
 * @throws {409} No capacity or system busy (concurrent lock conflict)
 */
export const bookings = async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'] as string;
    if (idempotencyKey) {
        const existing = store.getIdempotency(idempotencyKey);
        if (existing) return reply.status(200).send(existing);
    }

    const body = CreateBookingSchema.safeParse(request.body);
    if (!body.success) {
        return reply.status(400).send({ error: 'invalid_input', detail: body.error.format() });
    }
    const { restaurantId, sectorId, date, partySize, windowStart, windowEnd } = body.data;

    // B1: Calculate duration based on party size
    const durationMinutes = getDurationForPartySize(partySize);

    const lockKey = `${restaurantId}:${sectorId}:${date}`;
    if (!store.acquireLock(lockKey)) {
        return reply.status(409).send({ error: 'conflict', detail: 'System busy, please retry' });
    }

    try {
        const restaurant = store.getRestaurant(restaurantId);
        if (!restaurant) return reply.status(404).send({ error: 'not_found' });
        const tables = store.getTables(sectorId);
        const bookings = store.getAllBookings();

        let searchWindows = restaurant.windows || [];
        if (windowStart && windowEnd) {
            searchWindows = [{ start: windowStart, end: windowEnd }];
        }

        const candidates = findCandidates(tables, bookings, date, partySize, durationMinutes, searchWindows);
        const best = selectBestCandidate(candidates);

        if (!best) {
            return reply.status(409).send({ error: 'no_capacity', detail: 'No capacity found' });
        }

        const newBooking: Booking = {
            id: `BK_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            restaurantId,
            sectorId,
            tableIds: best.tableIds,
            partySize,
            durationMinutes,
            start: best.start,
            end: best.end,
            status: 'CONFIRMED',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        store.addBooking(newBooking);
        if (idempotencyKey) {
            store.setIdempotency(idempotencyKey, newBooking);
        }

        return reply.status(201).send(newBooking);
    } finally {
        store.releaseLock(lockKey);
    }
}

/**
 * List all bookings for a specific sector and date
 * 
 * Retrieves all confirmed bookings (excludes cancelled) for a given sector on a specific date.
 * 
 * @param request - Fastify request with query parameters:
 *   - restaurantId: Restaurant identifier
 *   - sectorId: Sector identifier  
 *   - date: Booking date (YYYY-MM-DD)
 * @param reply - Fastify reply object
 * @returns Object with date and items array containing all bookings
 * 
 * @throws {400} Invalid input
 */
export const bookingDay = async (request, reply) => {
    const query = ListBookingsQuerySchema.safeParse(request.query);
    if (!query.success) {
        return reply.status(400).send({ error: 'invalid_input' });
    }
    const { sectorId, date } = query.data;
    const items = store.getBookings(sectorId, date);
    return { date, items };
}

/**
 * Cancel a booking by ID
 * 
 * Marks a booking as CANCELLED. The booking remains in the system but is excluded
 * from availability calculations and listing queries.
 * 
 * @param request - Fastify request with params.id (booking identifier)
 * @param reply - Fastify reply object
 * @returns 204 No Content on success
 * 
 * @throws {404} Booking not found
 */
export const bookingDelete = (request, reply) => {
    const { id } = request.params;
    const success = store.cancelBooking(id);
    if (!success) {
        return reply.status(404).send({ error: 'not_found' });
    }
    return reply.status(204).send();
}