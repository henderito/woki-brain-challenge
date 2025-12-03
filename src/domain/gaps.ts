import { Booking, Candidate, TimeSlot } from "../types";
import { parseISO, addMinutes, isBefore, isAfter, set } from "date-fns";

/**
 * Parse date and time strings into a Date object
 * 
 * @param date - ISO date string (YYYY-MM-DD)
 * @param time - Time string in HH:mm format
 * @returns Date object with specified date and time, seconds/milliseconds zeroed
 */
export const parseTime = (date: string, time: string): Date => {
    const [hours, minutes] = time.split(':').map(Number);
    return set(parseISO(date), { hours: hours!, minutes: minutes!, seconds: 0, milliseconds: 0 });
}

/**
 * Find available time gaps for a single table
 * 
 * Algorithm:
 * 1. Define search windows (full day 00:00-23:59 or custom windows)
 * 2. Filter and sort bookings for this table by start time
 * 3. For each window, find gaps between bookings >= duration
 * 4. Include gap before first booking and after last booking if sufficient
 * 
 * Edge cases:
 * - Bookings outside window are ignored
 * - Only gaps >= duration are included
 * - Handles overlapping bookings correctly
 * 
 * @param tableId - Table identifier to find gaps for
 * @param bookings - All system bookings (filtered by tableId internally)
 * @param date - Target date (YYYY-MM-DD)
 * @param duration - Minimum gap duration in minutes
 * @param windows - Optional time windows to search within
 * @returns Array of time slots representing available gaps
 */
export const findGaps = (
    tableId: string,
    bookings: Booking[],
    date: string,
    duration: number,
    windows: { start: string; end: string }[] = []
): TimeSlot[] => {
    const start = parseTime(date, '00:00');
    const end = parseTime(date, '23:59');

    let searchWindows: TimeSlot[] = [];

    if (windows.length === 0) {
        searchWindows.push({ start, end });
    } else {
        searchWindows = windows.map(w => ({
            start: parseTime(date, w.start),
            end: parseTime(date, w.end)
        }));
    }

    const tableBookings = bookings.filter(booking => booking.tableIds.includes(tableId) && booking.status !== 'CANCELLED')
        .map(booking => ({ start: parseISO(booking.start), end: parseISO(booking.end) }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

    const gaps: TimeSlot[] = [];

    for (const window of searchWindows) {
        let current = window.start;

        for (const booking of tableBookings) {
            if (isBefore(booking.end, window.start)) continue;
            if (isAfter(booking.start, window.end)) break;

            if (isBefore(current, booking.start)) {
                const gapDuration = (booking.start.getTime() - current.getTime()) / 60000;
                if (gapDuration >= duration) {
                    gaps.push({ start: current, end: booking.start });
                }
            }

            if (isAfter(booking.end, current)) {
                current = booking.end;
            }
        }

        if (isBefore(current, window.end)) {
            const gapDuration = (window.end.getTime() - current.getTime()) / 60000;
            if (gapDuration >= duration) {
                gaps.push({ start: current, end: window.end });
            }
        }
    }

    return gaps;
}

/**
 * Find common time gaps across multiple tables (for combo bookings)
 * 
 * Algorithm:
 * 1. Start with gaps from first table
 * 2. For each subsequent table, find overlapping time periods
 * 3. Only keep intersections where overlap >= duration
 * 4. Result is gaps where ALL tables are simultaneously free
 * 
 * Example:
 * - Table1 gaps: [10:00-12:00, 14:00-16:00]
 * - Table2 gaps: [11:00-13:00, 14:30-17:00]
 * - Intersection: [11:00-12:00, 14:30-16:00]
 * 
 * @param gaps - Array of gap arrays, one per table
 * @param duration - Minimum intersection duration in minutes
 * @returns Array of time slots where all tables are free
 */
export const intersectGaps = (gaps: TimeSlot[][], duration: number): TimeSlot[] => {
    if (gaps.length === 0) return [];

    let commonGaps: TimeSlot[] = gaps[0]!;

    for (let i = 1; i < gaps.length; i++) {
        const nextGaps = gaps[i]!;
        const intersection: TimeSlot[] = [];

        for (const compared of commonGaps) {
            for (const nextToCompare of nextGaps) {
                const start = isAfter(compared.start, nextToCompare.start) ? compared.start : nextToCompare.start;
                const end = isBefore(compared.end, nextToCompare.end) ? compared.end : nextToCompare.end;

                if (isBefore(start, end)) {
                    const dur = (end.getTime() - start.getTime()) / 60000;
                    if (dur >= duration) {
                        intersection.push({ start, end });
                    }
                }
            }
        }
        commonGaps = intersection;
    }

    return commonGaps;
}

/**
 * Convert continuous time gaps into discrete booking candidates
 * 
 * Algorithm:
 * 1. For each gap, slide a window of size durationMinutes across it
 * 2. Step size is 15 minutes (slot granularity)
 * 3. Stop when window would extend beyond gap end
 * 4. Each position becomes a candidate with start/end times
 * 
 * Example: Gap 10:00-11:30, duration 60min, creates candidates:
 * - 10:00-11:00
 * - 10:15-11:15
 * - 10:30-11:30
 * 
 * @param gaps - Continuous time gaps to discretize
 * @param durationMinutes - Booking duration
 * @param tableIds - Tables involved (single ID or combo IDs)
 * @param kind - 'single' or 'combo'
 * @param waste - Wasted seats (capacity.max - partySize)
 * @returns Array of discrete candidates with 15-minute granularity
 */
export const discretizeGaps = (gaps: TimeSlot[], durationMinutes: number, tableIds: string[], kind: 'single' | 'combo', waste: number): Candidate[] => {
    const candidates: Candidate[] = [];

    for (const gap of gaps) {
        let current = gap.start;
        const lastStart = addMinutes(gap.end, -durationMinutes);

        while (current <= lastStart) {
            candidates.push({
                kind,
                tableIds,
                start: current.toISOString(),
                end: addMinutes(current, durationMinutes).toISOString(),
                waste
            });
            current = addMinutes(current, 15);
        }
    }

    return candidates;
};