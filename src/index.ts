/**
 * WokiBrain Booking Engine Server
 * 
 * Main entry point for the Fastify-based REST API server.
 * Configures rate limiting, logging, and route registration for the WokiBrain booking system.
 */

import fastify from "fastify";
import rateLimit from '@fastify/rate-limit';
import {
    discover,
    bookings,
    bookingDay,
    bookingDelete
} from "./routes";
import store from "./store/db";
import { seedData } from "./tests/seed-data";

const app = fastify({
    logger: {
        transport: {
            target: "pino-pretty",
            options: {
                colorize: true,
                ignore: "pid,hostname",
                translateTime: "SYS:dd-mm-yyyy HH:MM:ss"
            }
        }
    }
});

app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
});

app.register(function (app, _, done) {
    app.get("/discover", discover);
    app.post("/bookings", bookings);
    app.get("/bookings/day", bookingDay);
    app.delete("/bookings/:id", bookingDelete);

    done();
}, { prefix: "/woki" });

store.loadSeed(seedData);

app.listen({ port: 3000 });

export default app;