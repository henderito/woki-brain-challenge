/**
 * Restaurant entity representing a dining establishment
 * 
 * Contains service time windows defining when the restaurant accepts bookings.
 */
export interface Restaurant {
    id: string;
    name: string;
    timezone: string;
    /** Optional service windows (e.g., lunch 12:00-16:00, dinner 20:00-23:45). If empty, accepts bookings all day. */
    windows?: Array<{ start: string; end: string }>;
    createdAt: string;
    updatedAt: string;
}

/**
 * Sector within a restaurant (e.g., indoor dining, terrace, private room)
 * 
 * Tables belong to specific sectors. Bookings are scoped to a single sector.
 */
export interface Sector {
    id: string;
    restaurantId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Table entity with flexible capacity range
 * 
 * Tables can accommodate parties from minSize to maxSize people.
 * Can be combined with other tables for larger parties (combos).
 */
export interface Table {
    id: string;
    sectorId: string;
    name: string;
    /** Minimum party size this table can accommodate */
    minSize: number;
    /** Maximum party size this table can accommodate */
    maxSize: number;
    createdAt: string;
    updatedAt: string;
}

/**
 * Booking status enumeration
 */
export type BookingStatus = 'CONFIRMED' | 'CANCELLED';

/**
 * Booking for a party at one or more tables
 * 
 * Time intervals are half-open: [start, end) - a booking ending at 14:00
 * does not conflict with a booking starting at 14:00.
 */
export interface Booking {
    id: string;
    restaurantId: string;
    sectorId: string;
    /** Single table ID or array of table IDs for combo bookings */
    tableIds: string[];
    partySize: number;
    /** ISO datetime string - interval start (inclusive) */
    start: string;
    /** ISO datetime string - interval end (exclusive) */
    end: string;
    durationMinutes: number;
    status: BookingStatus;
    createdAt: string;
    updatedAt: string;
}

/**
 * Seed data structure for initializing the system
 */
export interface SeedData {
    restaurant: Restaurant;
    sector: Sector;
    tables: Table[];
    bookings: Booking[];
}

/**
 * Continuous time interval
 * 
 * Represents a gap in bookings or availability window.
 */
export interface TimeSlot {
    /** Interval start (inclusive) */
    start: Date;
    /** Interval end (exclusive for booking logic) */
    end: Date;
}

/**
 * Seating candidate for a party
 * 
 * Represents a specific seating option (single table or combo) at a specific time.
 * Candidates are generated from time gaps and ranked by selection strategy.
 */
export interface Candidate {
    /** 'single' for one table, 'combo' for multiple tables */
    kind: 'single' | 'combo';
    /** Table IDs involved in this candidate */
    tableIds: string[];
    /** ISO datetime string - booking start */
    start: string;
    /** ISO datetime string - booking end */
    end: string;
    /** Wasted seats (capacity.max - partySize), lower is better */
    waste: number;
}