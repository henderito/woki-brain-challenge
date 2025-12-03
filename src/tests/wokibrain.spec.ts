import { describe, it, expect } from 'vitest';
import { findGaps, intersectGaps } from '../domain/gaps.js';
import { getComboCapacity, selectBestCandidate } from '../domain/wokibrain.js';
import type { Candidate, Booking, Table } from '../types.js';
import { parseISO } from 'date-fns';
import { getDurationForPartySize } from '../domain/wokibrain';

describe('WokiBrain Logic', () => {
    const dateStr = '2025-10-22';

    it('should find gaps for a single table', () => {
        const eveningWindow = [{ start: '20:00', end: '23:45' }];

        const bookings: Booking[] = [
            {
                id: 'b1', restaurantId: 'r1', sectorId: 's1', tableIds: ['t1'], partySize: 2,
                start: '2025-10-22T20:30:00', end: '2025-10-22T21:15:00', durationMinutes: 45, status: 'CONFIRMED', createdAt: '', updatedAt: ''
            }
        ];

        const gaps = findGaps('t1', bookings, dateStr, 90, eveningWindow);

        expect(gaps.length).toBe(1);
        const { format } = require('date-fns');
        expect(format(gaps[0]!.start, 'HH:mm')).toBe('21:15');
        expect(format(gaps[0]!.end, 'HH:mm')).toBe('23:45');
    });

    it('should intersect gaps for combos', () => {
        const gaps1 = [{ start: parseISO('2025-10-22T20:00:00Z'), end: parseISO('2025-10-22T22:00:00Z') }];
        const gaps2 = [{ start: parseISO('2025-10-22T21:00:00Z'), end: parseISO('2025-10-22T23:00:00Z') }];

        const intersection = intersectGaps([gaps1, gaps2], 60);

        expect(intersection.length).toBe(1);
        expect(intersection[0]!.start.toISOString()).toBe('2025-10-22T21:00:00.000Z');
        expect(intersection[0]!.end.toISOString()).toBe('2025-10-22T22:00:00.000Z');
    });

    it('should calculate combo capacity correctly', () => {
        const t1: Table = { id: 't1', minSize: 2, maxSize: 4, sectorId: 's1', name: 'T1', createdAt: '', updatedAt: '' };
        const t2: Table = { id: 't2', minSize: 4, maxSize: 6, sectorId: 's1', name: 'T2', createdAt: '', updatedAt: '' };

        const cap = getComboCapacity([t1, t2]);
        expect(cap.min).toBe(6);
        expect(cap.max).toBe(10);
    });

    it('should select best candidate deterministically', () => {
        const c1: Candidate = { kind: 'combo', tableIds: ['t1', 't2'], start: '20:00', end: '21:30', waste: 2 };
        const c2: Candidate = { kind: 'single', tableIds: ['t3'], start: '20:00', end: '21:30', waste: 2 }; // Single preferred
        const c3: Candidate = { kind: 'single', tableIds: ['t4'], start: '20:00', end: '21:30', waste: 0 }; // Less waste preferred

        const best = selectBestCandidate([c1, c2, c3]);
        expect(best?.tableIds).toEqual(['t4']);
    });
});

describe('Business Rules', () => {
    describe('getDurationForPartySize', () => {
        it('should return 75 minutes for party size <= 2', () => {
            expect(getDurationForPartySize(1)).toBe(75);
            expect(getDurationForPartySize(2)).toBe(75);
        });

        it('should return 90 minutes for party size <= 4', () => {
            expect(getDurationForPartySize(3)).toBe(90);
            expect(getDurationForPartySize(4)).toBe(90);
        });

        it('should return 120 minutes for party size <= 8', () => {
            expect(getDurationForPartySize(5)).toBe(120);
            expect(getDurationForPartySize(8)).toBe(120);
        });

        it('should return 150 minutes for party size > 8', () => {
            expect(getDurationForPartySize(9)).toBe(150);
            expect(getDurationForPartySize(20)).toBe(150);
        });
    });
});
