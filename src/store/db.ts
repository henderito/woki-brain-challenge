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
 * 
 * Note: This is a development/demo store. Production should use a real database.
 */
class MemoryStore {
    restaurant: types.Restaurant | null = null;
    sector: types.Sector | null = null;
    tables: Map<string, types.Table> = new Map();
    bookings: Map<string, types.Booking> = new Map();

    private _locks: Map<string, number> = new Map();
    private _idempotency: Map<string, { booking: types.Booking; expiresAt: number }> = new Map();

    /**
     * Initialize memory store with optional seed data
     * 
     * Sets up automatic cleanup interval for expired idempotency keys (runs every minute).
     * 
     * @param seed - Optional initial data to populate store
     */
    constructor(seed?: types.SeedData) {
        if (seed) {
            this.loadSeed(seed);
        }

        // Cleanup expired idempotency keys periodically
        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of this._idempotency.entries()) {
                if (value.expiresAt <= now) {
                    this._idempotency.delete(key);
                }
            }
        }, 60000).unref(); // Run every minute, don't hold process open
    }

    /**
     * Load seed data into the store
     * 
     * @param seed - Seed data containing restaurant, sector, tables, and bookings
     */
    loadSeed(seed: types.SeedData) {
        this.restaurant = seed.restaurant;
        this.sector = seed.sector;
        seed.tables.forEach(t => this.tables.set(t.id, t));
        seed.bookings.forEach(b => this.bookings.set(b.id, b));
    }

    /**
     * Get restaurant by ID
     * 
     * @param id - Restaurant identifier
     * @returns Restaurant if found, undefined otherwise
     */
    getRestaurant(id: string): types.Restaurant | undefined {
        return this.restaurant?.id === id ? this.restaurant : undefined;
    }

    /**
     * Get sector by ID
     * 
     * @param id - Sector identifier
     * @returns Sector if found, undefined otherwise
     */
    getSector(id: string): types.Sector | undefined {
        return this.sector?.id === id ? this.sector : undefined;
    }

    /**
     * Get all tables for a sector
     * 
     * @param sectorId - Sector identifier
     * @returns Array of tables in the sector
     */
    getTables(sectorId: string): types.Table[] {
        return Array.from(this.tables.values()).filter(t => t.sectorId === sectorId);
    }

    /**
     * Get all confirmed bookings for a sector on a specific date
     * 
     * Filters out cancelled bookings.
     * 
     * @param sectorId - Sector identifier
     * @param date - Date in YYYY-MM-DD format
     * @returns Array of confirmed bookings
     */
    getBookings(sectorId: string, date: string): types.Booking[] {
        return Array.from(this.bookings.values()).filter(b =>
            b.sectorId === sectorId &&
            b.start.startsWith(date) &&
            b.status !== 'CANCELLED'
        );
    }

    /**
     * Get all bookings across all sectors and dates
     * 
     * @returns Array of all bookings (including cancelled)
     */
    getAllBookings(): types.Booking[] {
        return Array.from(this.bookings.values());
    }

    /**
     * Add a new booking to the store
     * 
     * @param booking - Booking to add
     */
    addBooking(booking: types.Booking) {
        this.bookings.set(booking.id, booking);
    }

    /**
     * Cancel a booking by marking it as CANCELLED
     * 
     * Booking remains in store but is excluded from availability calculations.
     * 
     * @param id - Booking identifier
     * @returns true if booking was found and cancelled, false otherwise
     */
    cancelBooking(id: string): boolean {
        const booking = this.bookings.get(id);
        if (!booking) return false;
        booking.status = 'CANCELLED';
        booking.updatedAt = new Date().toISOString();
        this.bookings.set(id, booking);
        return true;
    }

    /**
     * Acquire an optimistic lock for concurrent request coordination
     * 
     * Uses TTL-based locking to prevent deadlocks. If a lock is held and not expired,
     * acquisition fails. Expired locks are automatically replaced.
     * 
     * @param key - Lock key (typically "restaurantId:sectorId:date")
     * @param ttlMs - Lock time-to-live in milliseconds (default: 5000)
     * @returns true if lock acquired, false if lock is held by another request
     */
    acquireLock(key: string, ttlMs: number = 5000): boolean {
        const now = Date.now();
        const existing = this._locks.get(key);
        if (existing && existing > now) {
            return false;
        }
        this._locks.set(key, now + ttlMs);
        return true;
    }

    /**
     * Release an acquired lock
     * 
     * @param key - Lock key to release
     */
    releaseLock(key: string) {
        this._locks.delete(key);
    }

    /**
     * Retrieve booking associated with an idempotency key
     * 
     * Automatically cleans up expired entries.
     * 
     * @param key - Idempotency key from request header
     * @returns Associated booking if found and not expired, undefined otherwise
     */
    getIdempotency(key: string): types.Booking | undefined {
        const entry = this._idempotency.get(key);
        if (!entry) return undefined;

        if (entry.expiresAt <= Date.now()) {
            this._idempotency.delete(key);
            return undefined;
        }

        return entry.booking;
    }

    /**
     * Store a booking under an idempotency key
     * 
     * Keys automatically expire after TTL to prevent unbounded memory growth.
     * 
     * @param key - Idempotency key from request header
     * @param booking - Booking to associate with key
     * @param ttlMs - Time-to-live in milliseconds (default: 24 hours)
     */
    setIdempotency(key: string, booking: types.Booking, ttlMs: number = 24 * 60 * 60 * 1000) {
        this._idempotency.set(key, {
            booking,
            expiresAt: Date.now() + ttlMs
        });
    }
}

const store = new MemoryStore();

export default store;
