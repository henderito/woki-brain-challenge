import type * as types from "../types";
import { findGaps, discretizeGaps, intersectGaps } from './gaps';

/**
 * Calculate booking duration based on party size
 * 
 * Applies business rule B1: larger parties get longer booking durations.
 * 
 * @param partySize - Number of people in the party
 * @returns Duration in minutes:
 *   - 1-2 people: 75 minutes
 *   - 3-4 people: 90 minutes
 *   - 5-8 people: 120 minutes
 *   - 9+ people: 150 minutes
 */
export const getDurationForPartySize = (partySize: number): number => {
    if (partySize <= 2) return 75;
    if (partySize <= 4) return 90;
    if (partySize <= 8) return 120;
    return 150;
};

/**
 * Calculate combined capacity for a table combination
 * 
 * Uses the Sum of Capacities heuristic:
 * - Combo MinSize = Sum of all table MinSize values
 * - Combo MaxSize = Sum of all table MaxSize values
 * 
 * Example: T1(2-2) + T2(2-4) = Combo(4-6)
 * 
 * @param tables - Array of tables to combine
 * @returns Object with min and max combined capacity
 */
export const getComboCapacity = (tables: types.Table[]): { min: number; max: number; } => {
    const min = tables.reduce((sum, t) => sum + t.minSize, 0);
    const max = tables.reduce((sum, t) => sum + t.maxSize, 0);
    return { min, max };
}

/**
 * Generate all possible combinations (powerset) of an array
 * 
 * Uses functional reduce approach to build powerset iteratively.
 * For n items, generates 2^n combinations including empty set.
 * 
 * Example: [A, B] => [[], [A], [B], [A,B]]
 * 
 * @param arr - Input array of items
 * @returns All possible combinations including empty set
 */
function getAllCombinations<T>(arr: T[]): T[][] {
    return arr.reduce(
        (subsets, value) => subsets.concat(subsets.map(set => [value, ...set])),
        [[]] as T[][]
    );
}

/**
 * Find all seating candidates (single tables and combos) for a party
 * 
 * Two-phase algorithm:
 * 1. Single Table Phase: Find gaps in each table that fits party size
 * 2. Combo Phase: Generate all table combinations, check capacity, intersect gaps
 * 
 * For each viable option, discretizes continuous gaps into 15-minute slot candidates.
 * 
 * @param tables - All available tables in the sector
 * @param bookings - All bookings (used to calculate gaps)
 * @param date - Target booking date (YYYY-MM-DD)
 * @param partySize - Number of people to seat
 * @param duration - Required booking duration in minutes
 * @param windows - Optional service time windows (uses full day if empty)
 * @returns Array of all viable candidates (single + combo)
 */
export function findCandidates(
    tables: types.Table[],
    bookings: types.Booking[],
    date: string,
    partySize: number,
    duration: number,
    windows: { start: string; end: string }[] = []
): types.Candidate[] {
    const candidates: types.Candidate[] = [];

    for (const table of tables) {
        if (partySize >= table.minSize && partySize <= table.maxSize) {
            const gaps = findGaps(table.id, bookings, date, duration, windows);
            const waste = table.maxSize - partySize;
            candidates.push(...discretizeGaps(gaps, duration, [table.id], 'single', waste));
        }
    }

    const combos = getAllCombinations(tables);
    for (const combo of combos) {
        if (combo.length < 2) continue;

        const { min, max } = getComboCapacity(combo);
        if (partySize >= min && partySize <= max) {
            const gapsList = combo.map(t => findGaps(t.id, bookings, date, duration, windows));
            const commonGaps = intersectGaps(gapsList, duration);
            const waste = max - partySize;
            candidates.push(...discretizeGaps(commonGaps, duration, combo.map(t => t.id), 'combo', waste));
        }
    }

    return candidates;
}

/**
 * Select the best candidate using deterministic priority rules
 * 
 * Selection Strategy (in priority order):
 * 1. Kind: Single tables preferred over combos
 * 2. Waste: Lower wasted seats preferred (capacity.max - partySize)
 * 3. Start Time: Earlier start times preferred
 * 4. Table IDs: Lexicographical sort (tie-breaker for determinism)
 * 
 * @param candidates - Array of all viable candidates
 * @returns Best candidate according to strategy, or null if no candidates
 */
export function selectBestCandidate(candidates: types.Candidate[]): types.Candidate | null {
    if (candidates.length === 0) return null;

    return candidates.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'single' ? -1 : 1;
        if (a.waste !== b.waste) return a.waste - b.waste;
        if (a.start !== b.start) return a.start.localeCompare(b.start);
        return a.tableIds.join(',').localeCompare(b.tableIds.join(','));
    })[0] ?? null;
};