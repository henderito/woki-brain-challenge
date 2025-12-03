export interface Restaurant {
    id: string;
    name: string;
    timezone: string;
    windows?: Array<{ start: string; end: string }>;
    createdAt: string;
    updatedAt: string;
}

export interface Sector {
    id: string;
    restaurantId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface Table {
    id: string;
    sectorId: string;
    name: string;
    minSize: number;
    maxSize: number;
    createdAt: string;
    updatedAt: string;
}

export type BookingStatus = 'CONFIRMED' | 'CANCELLED';

export interface Booking {
    id: string;
    restaurantId: string;
    sectorId: string;
    tableIds: string[];
    partySize: number;
    start: string;
    end: string;
    durationMinutes: number;
    status: BookingStatus;
    createdAt: string;
    updatedAt: string;
}

export interface SeedData {
    restaurant: Restaurant;
    sector: Sector;
    tables: Table[];
    bookings: Booking[];
}

export interface TimeSlot {
    start: Date;
    end: Date;
}

export interface Candidate {
    kind: 'single' | 'combo';
    tableIds: string[];
    start: string;
    end: string;
    waste: number;
}