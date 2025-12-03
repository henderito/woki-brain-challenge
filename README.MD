# WokiBrain

A compact, Woki-branded booking engine for restaurants that discovers when and how to seat a party using single tables or table combinations.

## Features

- **Gap Discovery**: Finds free time slots for single tables and combinations.
- **Combos**: Automatically combines tables to fit larger parties.
- **Deterministic Selection**: Always returns the same best candidate for the same inputs.
- **Concurrency & Idempotency**: Safe for concurrent requests.
- **Minimal API**: 3 endpoints for discovery, booking, and listing.

## Setup & Run

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Run Server**:
    ```bash
    npm run start
    # or for development with hot reload
    npm run dev
    # or directly
    npx tsx src/index.ts
    ```
    Server runs on `http://localhost:3000`.

3.  **Run Tests**:
    ```bash
    npm run test
    # or
    npx vitest
    ```

## Architecture

### Gap Discovery Algorithm

The system uses a three-phase approach to find available seating:

1. **Single Table Phase**: For each table that can accommodate the party size (based on min/max capacity), finds continuous time gaps where the table is free
2. **Combo Phase**: Generates all possible table combinations (powerset), filters by combined capacity, then intersects gaps to find times when ALL tables in the combo are simultaneously available
3. **Discretization**: Converts continuous gaps into discrete 15-minute slot candidates

### Combo Capacity Heuristic

We use a **Sum of Capacities** approach:
- `MinSize = Sum(Table.MinSize)`
- `MaxSize = Sum(Table.MaxSize)`

Example: T1(2-2) + T2(2-4) = Combo(4-6).

### Selection Strategy

When multiple candidates (single or combo) are available, we select the "Best" one using this deterministic priority:

1.  **Kind**: Single tables are preferred over Combos.
2.  **Waste**: Candidates with less wasted seats (`Capacity.Max - PartySize`) are preferred.
3.  **Start Time**: Earlier start times are preferred.
4.  **Table IDs**: Lexicographical sort of Table IDs (Tie-breaker).

### Concurrency Strategy

- **Optimistic Locking**: Each booking request acquires a lock scoped to `restaurantId:sectorId:date`
- **Lock TTL**: 5-second time-to-live prevents deadlocks from crashed requests
- **Idempotency**: Duplicate requests with the same `Idempotency-Key` header return the same booking (24-hour TTL)

## API Reference

### 1. Discover Seats
`GET /woki/discover`

Find available seating candidates for a party.

**Query Params:**
- `restaurantId` (required) - Restaurant identifier
- `sectorId` (required) - Sector identifier
- `date` (required) - Booking date in YYYY-MM-DD format
- `partySize` (required) - Number of people
- `duration` (optional) - Duration in minutes (auto-calculated if omitted)
- `windowStart` (optional) - Search window start time (HH:mm)
- `windowEnd` (optional) - Search window end time (HH:mm)
- `limit` (optional) - Max candidates to return (default: 10)

**Example Response:**
```json
{
  "slotMinutes": 15,
  "durationMinutes": 75,
  "candidates": [
    {
      "kind": "single",
      "tableIds": ["T1"],
      "start": "2025-10-22T20:00:00.000Z",
      "end": "2025-10-22T21:15:00.000Z",
      "waste": 0
    },
    {
      "kind": "combo",
      "tableIds": ["T2", "T3"],
      "start": "2025-10-22T20:15:00.000Z",
      "end": "2025-10-22T21:30:00.000Z",
      "waste": 2
    }
  ]
}
```

### 2. Create Booking
`POST /woki/bookings`

Create a new booking for a party.

**Headers:**
- `Idempotency-Key` (optional) - Unique key for idempotent requests

**Body:**
```json
{
  "restaurantId": "R1",
  "sectorId": "S1",
  "partySize": 2,
  "date": "2025-10-22",
  "windowStart": "20:00",
  "windowEnd": "23:00"
}
```

**Example Response (201 Created):**
```json
{
  "id": "BK_1234567890_abc12",
  "restaurantId": "R1",
  "sectorId": "S1",
  "tableIds": ["T1"],
  "partySize": 2,
  "durationMinutes": 75,
  "start": "2025-10-22T20:00:00.000Z",
  "end": "2025-10-22T21:15:00.000Z",
  "status": "CONFIRMED",
  "createdAt": "2025-10-22T19:45:00.000Z",
  "updatedAt": "2025-10-22T19:45:00.000Z"
}
```

### 3. List Bookings
`GET /woki/bookings/day`

List all confirmed bookings for a sector on a specific date.

**Query Params:**
- `restaurantId` (required)
- `sectorId` (required)
- `date` (required) - YYYY-MM-DD format

**Example Response:**
```json
{
  "date": "2025-10-22",
  "items": [
    {
      "id": "BK_1234567890_abc12",
      "restaurantId": "R1",
      "sectorId": "S1",
      "tableIds": ["T1"],
      "partySize": 2,
      "durationMinutes": 75,
      "start": "2025-10-22T20:00:00.000Z",
      "end": "2025-10-22T21:15:00.000Z",
      "status": "CONFIRMED",
      "createdAt": "2025-10-22T19:45:00.000Z",
      "updatedAt": "2025-10-22T19:45:00.000Z"
    }
  ]
}
```

### 4. Cancel Booking
`DELETE /woki/bookings/:id`

Cancel a booking by ID.

**Response:** 204 No Content

## Error Codes

The API uses standard HTTP status codes:

- **200 OK** - Successful request or idempotent booking request
- **201 Created** - Booking successfully created
- **204 No Content** - Booking successfully cancelled
- **400 Bad Request** - Invalid input (malformed parameters or body)
- **404 Not Found** - Restaurant, sector, or booking not found
- **409 Conflict** - No capacity available or system busy (concurrent lock conflict)
- **429 Too Many Requests** - Rate limit exceeded (100 requests per minute)

**Error Response Format:**
```json
{
  "error": "error_code",
  "detail": "Human-readable description"
}
```

## Configuration

- **Port**: 3000 (hardcoded)
- **Rate Limit**: 100 requests per minute
- **Lock TTL**: 5 seconds
- **Idempotency TTL**: 24 hours
- **Slot Granularity**: 15 minutes
- **Booking Durations** (based on party size):
  - 1-2 people: 75 minutes
  - 3-4 people: 90 minutes
  - 5-8 people: 120 minutes
  - 9+ people: 150 minutes

## Development

```bash
npm run dev    # Run with hot reload (tsx watch)
npm run start  # Run production mode
npm run test   # Run all tests with Vitest
```

## Logic & Heuristics

### Business Rules

- **B1: Duration by Party Size** - Larger parties automatically receive longer booking durations
- **Half-Open Intervals** - Bookings use `[start, end)` semantics - a booking ending at 14:00 doesn't conflict with one starting at 14:00
- **Service Windows** - Restaurants can define multiple service windows (e.g., lunch 12:00-16:00, dinner 20:00-23:45)
