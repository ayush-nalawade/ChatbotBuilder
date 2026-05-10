const IORedis = require('ioredis');

/**
 * Redis Connection Factory
 *
 * BullMQ requires a SEPARATE IORedis instance for each role:
 *   - Queue   (producer) — pushes jobs
 *   - Worker  (consumer) — processes jobs
 *   - QueueEvents        — monitors events
 *
 * Sharing a single connection across roles causes connection-state conflicts
 * and "maxRetriesPerRequest must be null" errors under load.
 *
 * Call createRedisConnection(label) once per role to get a dedicated instance.
 */
function createRedisConnection(label = 'default') {
    const conn = new IORedis({
        host               : process.env.REDIS_HOST     || '127.0.0.1',
        port               : parseInt(process.env.REDIS_PORT || '6379', 10),
        password           : process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,   // REQUIRED by BullMQ
        enableReadyCheck   : false,   // Prevents startup race conditions
        lazyConnect        : false,
    });

    conn.on('connect', () => {
        console.log(`[Redis:${label}] Connected`, true, true);
    });

    conn.on('error', (err) => {
        console.log(`[Redis:${label}] Connection error: ${err.message}`, true, true);
    });

    return conn;
}

module.exports = { createRedisConnection };
