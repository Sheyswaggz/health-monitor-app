import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import logger from './utils/logger.js';
import { initDatabase, closeDatabase } from './config/database.js';
import errorHandler, { notFoundHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.js';

// Load environment variables
dotenv.config();

// Configuration with defaults
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create Express application
const app = express();

// Trust proxy for accurate IP addresses behind reverse proxies
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400 // 24 hours
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.id = requestId;
  
  const startTime = Date.now();
  
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    
    logger.log(logLevel, 'Request completed', {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('content-length')
    });
  });

  next();
});

// Mount health check routes
app.use('/', healthRoutes);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handling middleware
app.use(errorHandler);

// Server instance reference
let server = null;

/**
 * Initialize application
 * Sets up database connection and starts server
 */
async function initializeApp() {
  try {
    logger.info('Initializing application', {
      nodeVersion: process.version,
      environment: NODE_ENV,
      port: PORT
    });

    // Initialize database
    initDatabase();
    logger.info('Database initialized successfully');

    // Start server
    server = app.listen(PORT, () => {
      logger.info('Server started successfully', {
        port: PORT,
        environment: NODE_ENV,
        corsOrigin: CORS_ORIGIN,
        pid: process.pid
      });
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error('Port already in use', {
          port: PORT,
          error: error.message
        });
      } else {
        logger.error('Server error', {
          error: error.message,
          code: error.code,
          stack: error.stack
        });
      }
      process.exit(1);
    });

    // Handle server listening errors
    server.on('clientError', (error, socket) => {
      logger.error('Client error', {
        error: error.message,
        code: error.code
      });
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });

  } catch (error) {
    logger.error('Failed to initialize application', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 * Closes server and database connections cleanly
 */
async function gracefulShutdown(signal) {
  logger.info('Graceful shutdown initiated', { signal });

  // Stop accepting new connections
  if (server) {
    server.close((err) => {
      if (err) {
        logger.error('Error closing server', {
          error: err.message,
          stack: err.stack
        });
      } else {
        logger.info('Server closed successfully');
      }

      // Close database connection
      try {
        closeDatabase();
        logger.info('Database connection closed successfully');
      } catch (dbError) {
        logger.error('Error closing database', {
          error: dbError.message,
          stack: dbError.stack
        });
      }

      // Exit process
      const exitCode = err ? 1 : 0;
      logger.info('Application shutdown complete', { exitCode });
      process.exit(exitCode);
    });

    // Force shutdown after timeout
    const shutdownTimeout = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000); // 30 seconds

    shutdownTimeout.unref();
  } else {
    // No server running, just close database
    try {
      closeDatabase();
      logger.info('Database connection closed successfully');
    } catch (dbError) {
      logger.error('Error closing database', {
        error: dbError.message,
        stack: dbError.stack
      });
    }
    process.exit(0);
  }
}

// Handle process termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise)
  });
  gracefulShutdown('unhandledRejection');
});

// Initialize application if not in test environment
if (NODE_ENV !== 'test') {
  initializeApp();
}

// Export app for testing
export default app;