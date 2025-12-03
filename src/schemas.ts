import { z } from 'zod';

/**
 * Validation schema for GET /woki/discover query parameters
 * 
 * Discovers available seating candidates for a party.
 */
export const DiscoverQuerySchema = z.object({
    restaurantId: z.string(),
    sectorId: z.string(),
    /** Date in YYYY-MM-DD format */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Number of people (automatically coerced from string) */
    partySize: z.coerce.number().positive(),
    /** Optional duration override (auto-calculated from partySize if omitted) */
    duration: z.coerce.number().positive().optional(),
    /** Optional window start time (HH:mm format) */
    windowStart: z.string().optional(),
    /** Optional window end time (HH:mm format) */
    windowEnd: z.string().optional(),
    /** Maximum number of candidates to return (default: 10) */
    limit: z.coerce.number().optional(),
});

/**
 * Validation schema for POST /woki/bookings request body
 * 
 * Creates a new booking for a party.
 */
export const CreateBookingSchema = z.object({
    restaurantId: z.string(),
    sectorId: z.string(),
    /** Number of people in the party */
    partySize: z.number().positive(),
    /** Optional duration override (auto-calculated if omitted) */
    durationMinutes: z.number().positive().optional(),
    /** Date in YYYY-MM-DD format */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Optional window start time (HH:mm format) */
    windowStart: z.string().optional(),
    /** Optional window end time (HH:mm format) */
    windowEnd: z.string().optional(),
});

/**
 * Validation schema for GET /woki/bookings/day query parameters
 * 
 * Lists all bookings for a sector on a specific date.
 */
export const ListBookingsQuerySchema = z.object({
    restaurantId: z.string(),
    sectorId: z.string(),
    /** Date in YYYY-MM-DD format */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});