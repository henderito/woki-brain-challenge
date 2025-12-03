import { z } from 'zod';

export const DiscoverQuerySchema = z.object({
    restaurantId: z.string(),
    sectorId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    partySize: z.coerce.number().positive(),
    duration: z.coerce.number().positive().optional(),
    windowStart: z.string().optional(),
    windowEnd: z.string().optional(),
    limit: z.coerce.number().optional(),
});

export const CreateBookingSchema = z.object({
    restaurantId: z.string(),
    sectorId: z.string(),
    partySize: z.number().positive(),
    durationMinutes: z.number().positive().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    windowStart: z.string().optional(),
    windowEnd: z.string().optional(),
});

export const ListBookingsQuerySchema = z.object({
    restaurantId: z.string(),
    sectorId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});