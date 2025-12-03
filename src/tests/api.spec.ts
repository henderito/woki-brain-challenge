import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import store from '../store/db';
import app from '../index';
import { seedData } from './seed-data';

describe('WokiBrain API', () => {
    beforeAll(async () => {
        await app.ready();
        store.loadSeed(seedData);
    });

    afterAll(async () => {
        await app.close();
    });

    it('GET /woki/discover - should return candidates', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/woki/discover',
            query: {
                restaurantId: 'R1',
                sectorId: 'S1',
                date: '2025-10-22',
                partySize: '2'
            }
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.candidates.length).toBeGreaterThan(0);
        expect(body.durationMinutes).toBe(75);
        expect(body.candidates[0].kind).toBeDefined();
    });

    it('POST /woki/bookings - should create a booking', async () => {
        const payload = {
            restaurantId: 'R1',
            sectorId: 'S1',
            partySize: 2,
            date: '2025-10-22',
            windowStart: '20:00',
            windowEnd: '23:45'
        };

        const response = await app.inject({
            method: 'POST',
            url: '/woki/bookings',
            payload
        });

        expect(response.statusCode).toBe(201);
        const booking = response.json();
        expect(booking.id).toBeDefined();
        expect(booking.status).toBe('CONFIRMED');
        expect(booking.durationMinutes).toBe(75);
    });

    it('POST /woki/bookings - idempotency', async () => {
        const payload = {
            restaurantId: 'R1',
            sectorId: 'S1',
            partySize: 2,
            date: '2025-10-22',
            windowStart: '20:00',
            windowEnd: '23:45'
        };
        const key = 'test-idempotency-key';

        const res1 = await app.inject({
            method: 'POST',
            url: '/woki/bookings',
            headers: { 'Idempotency-Key': key },
            payload
        });
        expect(res1.statusCode).toBe(201);

        const res2 = await app.inject({
            method: 'POST',
            url: '/woki/bookings',
            headers: { 'Idempotency-Key': key },
            payload
        });
        expect(res2.statusCode).toBe(200);
        expect(res2.json().id).toBe(res1.json().id);
    });

    it('DELETE /woki/bookings/:id - should delete a booking', async () => {
        const payload = {
            restaurantId: 'R1',
            sectorId: 'S1',
            partySize: 2,
            date: '2025-10-23',
            windowStart: '20:00',
            windowEnd: '23:45'
        };

        const createRes = await app.inject({
            method: 'POST',
            url: '/woki/bookings',
            payload
        });

        expect(createRes.statusCode).toBe(201);
        const bookingId = createRes.json().id;

        const deleteRes = await app.inject({
            method: 'DELETE',
            url: `/woki/bookings/${bookingId}`
        });

        expect(deleteRes.statusCode).toBe(204);

        const listRes = await app.inject({
            method: 'GET',
            url: '/woki/bookings/day',
            query: {
                restaurantId: 'R1',
                sectorId: 'S1',
                date: '2025-10-23'
            }
        });

        const items = listRes.json().items;
        const found = items.find((b: any) => b.id === bookingId);
        expect(found).toBeUndefined();
    });

    it('Should book a combo when singles cannot fit', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/woki/discover',
            query: {
                restaurantId: 'R1',
                sectorId: 'S1',
                date: '2025-10-25',
                partySize: '6'
            }
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.candidates.length).toBeGreaterThan(0);
    });

    it('Boundary: bookings touching at end are accepted (end-exclusive)', async () => {
        const booking1 = await app.inject({
            method: 'POST',
            url: '/woki/bookings',
            payload: {
                restaurantId: 'R1',
                sectorId: 'S1',
                partySize: 2,
                date: '2025-10-26',
                windowStart: '20:00',
                windowEnd: '21:30'
            }
        });
        expect(booking1.statusCode).toBe(201);
        const b1 = booking1.json();

        const booking2 = await app.inject({
            method: 'POST',
            url: '/woki/bookings',
            payload: {
                restaurantId: 'R1',
                sectorId: 'S1',
                partySize: 2,
                date: '2025-10-26',
                windowStart: '21:30',
                windowEnd: '23:00'
            }
        });

        expect(booking2.statusCode).toBe(201);
    });

    it('Concurrency: parallel creates demonstrate atomic locking', async () => {
        const payload = {
            restaurantId: 'R1',
            sectorId: 'S1',
            partySize: 2,
            date: '2025-11-05',
            windowStart: '20:00',
            windowEnd: '21:30'
        };

        const [res1, res2] = await Promise.all([
            app.inject({ method: 'POST', url: '/woki/bookings', payload }),
            app.inject({ method: 'POST', url: '/woki/bookings', payload })
        ]);

        expect(res1.statusCode).toBe(201);
        expect(res2.statusCode).toBe(201);

        const b1 = res1.json();
        const b2 = res2.json();
        expect(b1.tableIds[0]).not.toBe(b2.tableIds[0]);
    });

    it('Outside hours: request outside service windows → 409', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/woki/bookings',
            payload: {
                restaurantId: 'R1',
                sectorId: 'S1',
                partySize: 2,
                date: '2025-10-28',
                windowStart: '10:00',
                windowEnd: '11:00'
            }
        });

        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe('no_capacity');
    });

    it('API Hardening: should rate limit requests', async () => {
        const limit = 100;
        const promises = [];
        for (let i = 0; i < limit + 5; i++) {
            promises.push(app.inject({
                method: 'GET',
                url: '/woki/discover?restaurantId=R1&sectorId=S1&date=2025-10-22&partySize=2'
            }));
        }

        const responses = await Promise.all(promises);
        const tooManyRequests = responses.filter(r => r.statusCode === 429);

        expect(tooManyRequests.length).toBeGreaterThan(0);
    });

    it('API Hardening: should expire idempotency keys', async () => {
        const key = 'expiring-key-test';
        const booking: any = { id: 'test', status: 'CONFIRMED' };

        store.setIdempotency(key, booking, 10);

        expect(store.getIdempotency(key)).toEqual(booking);

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(store.getIdempotency(key)).toBeUndefined();
    });
});