const { Queue } = require('bullmq');
const { createRedisConnection } = require('./redisConnection');

const QUEUE_NAME = 'whatsapp-messages';

/**
 * Message Queue (Producer)
 *
 * Gets its OWN dedicated Redis connection (never shared with the Worker).
 * Per-phone deduplication: WebhookController passes `jobId: phoneNumber`
 * so BullMQ automatically drops duplicate jobs for the same phone if one
 * is already waiting or active — preventing race conditions under burst traffic.
 */
const messageQueue = new Queue(QUEUE_NAME, {
    connection: createRedisConnection('queue-producer'),
    prefix    : '{chatbot}',   // Hash tag: forces all keys into the same Redis cluster slot
    defaultJobOptions: {
        attempts    : 3,
        backoff     : {
            type : 'exponential',
            delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail    : 500,
    },
});

// global.slashLogs('[MessageQueue] WhatsApp message queue initialized', true, true);

module.exports = { messageQueue, QUEUE_NAME };

