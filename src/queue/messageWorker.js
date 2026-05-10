const { Worker, QueueEvents } = require('bullmq');
const { createRedisConnection } = require('./redisConnection');
const { QUEUE_NAME, messageQueue } = require('./messageQueue');
const FlowExecutor               = require('../services/FlowExecutor');
const FlowRepository             = require('../repositories/FlowRepository');
const MessageRepository          = require('../repositories/MessageRepository');
const WhatsAppService            = require('../services/WhatsAppService');

// Concurrency: process up to N messages simultaneously.
// Each concurrent job holds DB connections — keep this tuned to your DB pool size.
const WORKER_CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY || '10', 10);

let workerInstance   = null;
let queueEventsInstance = null;

// Runtime stats (in-memory, reset on restart — good enough for a health check)
const stats = {
    processed : 0,
    failed    : 0,
    startedAt : null,
};

/**
 * Start the BullMQ worker.
 * Must be called AFTER the database is connected (i.e. from server.js, not app.js).
 */
function startMessageWorker() {
    if (workerInstance) {
        console.log('[Worker] Already running — skipping duplicate start', true, true);
        return workerInstance;
    }

    stats.startedAt = new Date().toISOString();

    // ── Worker (consumer) — gets its OWN dedicated Redis connection
    workerInstance = new Worker(
        QUEUE_NAME,
        async (job) => {
            const { webhookData } = job.data;
            console.log(`[Worker] Processing job ${job.id} (attempt ${job.attemptsMade + 1})`, true, true);

            const flowExecutor      = new FlowExecutor();
            const flowRepository    = new FlowRepository();
            const messageRepository = new MessageRepository();

            await processWhatsAppJob(webhookData, flowExecutor, flowRepository, messageRepository);
        },
        {
            connection  : createRedisConnection('worker-consumer'),
            concurrency : WORKER_CONCURRENCY,
            prefix      : '{chatbot}',
        }
    );

    workerInstance.on('completed', (job) => {
        stats.processed++;
        console.log(`[Worker] Job ${job.id} completed`, true, true);
    });

    workerInstance.on('failed', (job, err) => {
        stats.failed++;
        console.log(
            `[Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}): ${err.message}`,
            true, true
        );
    });

    workerInstance.on('error', (err) => {
        console.log(`[Worker] Internal error: ${err.message}`, true, true);
    });

    // ── QueueEvents — monitors the queue on a separate connection
    queueEventsInstance = new QueueEvents(QUEUE_NAME, {
        connection: createRedisConnection('queue-events'),
        prefix    : '{chatbot}',
    });

    queueEventsInstance.on('waiting', ({ jobId }) => {
        console.log(`[QueueEvents] Job ${jobId} is waiting`, true, true);
    });

    queueEventsInstance.on('stalled', ({ jobId }) => {
        console.log(`[QueueEvents] Job ${jobId} stalled — will be retried`, true, true);
    });

    console.log(`[Worker] Started (concurrency: ${WORKER_CONCURRENCY})`, true, true);
    return workerInstance;
}

/**
 * Core processing logic — runs inside the BullMQ worker for every job.
 */
async function processWhatsAppJob(webhookData, flowExecutor, flowRepository, messageRepository) {
    try {
        // ── Parse incoming message
        const messageData = WhatsAppService.parseIncomingMessage(webhookData);

        if (messageData) {
            console.log(`[Worker] Message from ${messageData.from}`, true, true);

            const entry         = webhookData.entry?.[0];
            const change        = entry?.changes?.[0];
            const value         = change?.value;
            const phoneNumberId = value?.metadata?.phone_number_id;

            // ── Find the published flow for this WhatsApp phone number ID
            // Uses the proper repository method (handles status/published filter correctly)
            const flow = await flowRepository.getFlowByWhatsAppNumber(phoneNumberId);

            if (!flow) {
                console.log(`[Worker] No active published flow for phone_number_id: ${phoneNumberId}`, true, true);
                return;
            }

            // ── Determine user input text
            let userInput   = null;
            let displayText = null;

            if (messageData.type === 'text') {
                userInput   = messageData.text;
                displayText = messageData.text;
            } else if (messageData.type === 'interactive') {
                const buttonReply = messageData.interactive?.button_reply;
                const listReply   = messageData.interactive?.list_reply;
                userInput   = buttonReply?.id    || listReply?.id    || '';
                displayText = buttonReply?.title || listReply?.title || userInput;
            }

            // ── Execute flow — all the heavy DB reads + WhatsApp API calls happen here,
            //    completely decoupled from the HTTP request that already returned 200.
            await flowExecutor.processMessage(
                flow.flow_id,
                messageData.from,
                messageData.name,
                userInput || messageData.text || '',
                messageData.from,
                'whatsapp',
                false,
                null,
                displayText || userInput || messageData.text || ''
            );
        }

        // ── Handle delivery status updates (read receipts, delivered, etc.)
        const statusData = WhatsAppService.parseStatusUpdate(webhookData);

        if (statusData) {
            console.log(`[Worker] Status update: ${statusData.status} for msg ${statusData.messageId}`, true, true);
            await messageRepository.updateByWhatsAppMessageId(statusData.messageId, statusData.status);
        }

    } catch (error) {
        console.log(`[Worker] Job error: ${error.message}`, true, true);
        throw error; // Re-throw so BullMQ retries according to backoff config
    }
}

/**
 * Returns live queue depth + runtime stats — used by QueueController health endpoint.
 */
async function getWorkerStats() {
    const [waiting, active, failed, delayed] = await Promise.all([
        messageQueue.getWaitingCount(),
        messageQueue.getActiveCount(),
        messageQueue.getFailedCount(),
        messageQueue.getDelayedCount(),
    ]);

    return {
        worker: {
            running    : !!workerInstance,
            concurrency: WORKER_CONCURRENCY,
            startedAt  : stats.startedAt,
            processed  : stats.processed,
            failed     : stats.failed,
        },
        queue: {
            waiting,
            active,
            failed,
            delayed,
        },
    };
}

/**
 * Graceful shutdown — drain in-flight jobs before process exits.
 */
async function stopMessageWorker() {
    if (queueEventsInstance) {
        await queueEventsInstance.close();
        console.log('[Worker] QueueEvents closed', true, true);
    }
    if (workerInstance) {
        await workerInstance.close();
        workerInstance = null;
        console.log('[Worker] Worker stopped gracefully', true, true);
    }
}

module.exports = { startMessageWorker, stopMessageWorker, getWorkerStats };
