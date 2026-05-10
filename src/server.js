require('dotenv').config();
const http              = require('http');
const { Server }        = require('socket.io');
const app               = require('./app');
const databaseConfig    = require('./config/database');
const socketHandlers    = require('./socketHandlers');


const PORT = process.env.PORT || 3006;

const startServer = async () => {
    try {
        // Connect to database
        console.log(`Connecting to ScyllaDB...`, true, true);
        await databaseConfig.connect();
        console.log(`Connected to ScyllaDB successfully`, true, true);

        // Create HTTP server and attach Socket.IO
        const server = http.createServer(app);
        const io = new Server(server, {
            cors: {
                origin: process.env.FRONTEND_URL || '*',
                methods: ['GET', 'POST'],
                credentials: true,
            },
        });

        // Make io globally accessible (for FlowExecutor, WebhookController)
        global.io = io;

        // Register all Socket.IO event handlers
        socketHandlers(io);

        // Start listening
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`, true, true);
        });

        // Graceful shutdown
        const gracefulShutdown = async (signal) => {
            console.log(`${signal} received, shutting down gracefully...`, true, true);

            server.close(async () => {
                console.log('HTTP server closed', true, true);

                // Close database connection
                await databaseConfig.disconnect();
                console.log('Database connection closed', true, true);

                process.exit(0);
            });

            // Force shutdown after 10 seconds
            setTimeout(() => {
                console.log('Forced shutdown after timeout', true, true);
                process.exit(1);
            }, 10000);
        };

        // Handle shutdown signals
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.log('Uncaught exception', true, true);
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.log('Unhandled rejection', true, true);
            process.exit(1);
        });

    } catch (error) {
        console.log('Failed to start server', true, true);
        process.exit(1);
    }
};

//server start
startServer();
