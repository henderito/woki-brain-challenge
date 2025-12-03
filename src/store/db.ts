import * as types from "../types";

/**
 * In-memory data store for WokiBrain booking system
 * 
 * Features:
 * - Simple in-memory storage for restaurants, sectors, tables, and bookings
 * - Optimistic locking for concurrent booking requests (key-based with TTL)
 * - Idempotency key support with automatic expiration (24hr TTL)
 * - Automatic cleanup of expired idempotency keys
 * 
 * Concurrency Strategy:
 * - acquireLock/releaseLock provide mutex-like behavior per restaurant:sector:date
 * - Lock TTL prevents deadlocks from crashed requests
 * - Idempotency prevents duplicate bookings from retried requests
 */
class MemoryStore {
    restaurant: types.Restaurant | null = null;
    sector: types.Sector | null = null;
    tables: Map<string, types.Table> = new Map();
    bookings: Map<string, types.Booking> = new Map();

    private _locks: Map<string, number> = new Map();
    private _idempotency: Map<string, { booking: types.Booking; expiresAt: number }> = new Map();

    constructor(seed?: types.SeedData) {
        if (seed) {
            this.loadSeed(seed);
        }

        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of this._idempotency.entries()) {
                if (value.expiresAt <= now) {
                    this._idempotency.delete(key);
                }
            }
        }, 60000).unref();
    }

    loadSeed(seed: types.SeedData) {
        this.restaurant = seed.restaurant;
        this.sector = seed.sector;
        seed.tables.forEach(t => this.tables.set(t.id, t));
        seed.bookings.forEach(b => this.bookings.set(b.id, b));
    }
    getRestaurant(id: string): types.Restaurant | undefined {
        return this.restaurant?.id === id ? this.restaurant : undefined;
    }

    getSector(id: string): types.Sector | undefined {
        return this.sector?.id === id ? this.sector : undefined;
    }

    getTables(sectorId: string): types.Table[] {
        return Array.from(this.tables.values()).filter(t => t.sectorId === sectorId);
    }

    getBookings(sectorId: string, date: string): types.Booking[] {
        return Array.from(this.bookings.values()).filter(b =>
            b.sectorId === sectorId &&
            b.start.startsWith(date) &&
            b.status !== 'CANCELLED'
        );
    }

    getAllBookings(): types.Booking[] {
        return Array.from(this.bookings.values());
    }

    addBooking(booking: types.Booking) {
        this.bookings.set(booking.id, booking);
    }

    cancelBooking(id: string): boolean {
        const booking = this.bookings.get(id);
        if (!booking) return false;
        booking.status = 'CANCELLED';
        booking.updatedAt = new Date().toISOString();
        this.bookings.set(id, booking);
        return true;
    }

    acquireLock(key: string, ttlMs: number = 5000): boolean {
        const now = Date.now();
        const existing = this._locks.get(key);
        if (existing && existing > now) {
            return false;
        }
        this._locks.set(key, now + ttlMs);
        return true;
    }

    releaseLock(key: string) {
        this._locks.delete(key);
    }

    getIdempotency(key: string): types.Booking | undefined {
        const entry = this._idempotency.get(key);
        if (!entry) return undefined;

        if (entry.expiresAt <= Date.now()) {
            this._idempotency.delete(key);
            return undefined;
        }

        return entry.booking;
    }

    setIdempotency(key: string, booking: types.Booking, ttlMs: number = 24 * 60 * 60 * 1000) {
        this._idempotency.set(key, {
            booking,
            expiresAt: Date.now() + ttlMs
        });
    }
}

const store = new MemoryStore();

export default store;
