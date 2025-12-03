export const seedData = {
    restaurant: {
        id: "R1",
        name: "Bistro Central",
        timezone: "America/Argentina/Buenos_Aires",
        windows: [
            { start: "12:00", end: "16:00" },
            { start: "20:00", end: "23:45" }
        ],
        createdAt: "2025-10-22T00:00:00-03:00",
        updatedAt: "2025-10-22T00:00:00-03:00"
    },
    sector: {
        id: "S1",
        restaurantId: "R1",
        name: "Main Hall",
        createdAt: "2025-10-22T00:00:00-03:00",
        updatedAt: "2025-10-22T00:00:00-03:00"
    },
    tables: [
        { id: "T1", sectorId: "S1", name: "Table 1", minSize: 2, maxSize: 2, createdAt: "", updatedAt: "" },
        { id: "T2", sectorId: "S1", name: "Table 2", minSize: 2, maxSize: 4, createdAt: "", updatedAt: "" },
        { id: "T3", sectorId: "S1", name: "Table 3", minSize: 2, maxSize: 4, createdAt: "", updatedAt: "" },
        { id: "T4", sectorId: "S1", name: "Table 4", minSize: 4, maxSize: 6, createdAt: "", updatedAt: "" },
        { id: "T5", sectorId: "S1", name: "Table 5", minSize: 2, maxSize: 2, createdAt: "", updatedAt: "" }
    ],
    bookings: [
        {
            id: "B1",
            restaurantId: "R1",
            sectorId: "S1",
            tableIds: ["T2"],
            partySize: 3,
            start: "2025-10-22T20:30:00-03:00",
            end: "2025-10-22T21:15:00-03:00",
            durationMinutes: 45,
            status: "CONFIRMED" as const,
            createdAt: "2025-10-22T18:00:00-03:00",
            updatedAt: "2025-10-22T18:00:00-03:00"
        }
    ]
};
