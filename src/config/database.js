import Database from 'better-sqlite3';
import logger from '../utils/logger.js';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/health-monitor.db';

let db = null;

/**
 * Initialize SQLite database with optimal configuration
 * Creates database file, enables WAL mode, and sets performance pragmas
 * @returns {Database} Initialized database instance
 * @throws {Error} If database initialization fails
 */
export function initDatabase() {
  try {
    logger.info('Initializing database', { path: DATABASE_PATH });

    // Create database instance
    db = new Database(DATABASE_PATH, {
      verbose: process.env.NODE_ENV !== 'production' 
        ? (message) => logger.debug('SQLite:', { query: message })
        : undefined
    });

    // Enable Write-Ahead Logging for better concurrency
    db.pragma('journal_mode = WAL');
    logger.debug('Enabled WAL mode');

    // Set synchronous mode to NORMAL for better performance
    // NORMAL is safe with WAL mode and provides good balance
    db.pragma('synchronous = NORMAL');
    logger.debug('Set synchronous mode to NORMAL');

    // Set busy timeout to handle concurrent access
    db.pragma('busy_timeout = 5000');
    logger.debug('Set busy timeout to 5000ms');

    // Enable foreign key constraints
    db.pragma('foreign_keys = ON');
    logger.debug('Enabled foreign key constraints');

    // Set cache size (negative value means KB, positive means pages)
    db.pragma('cache_size = -64000'); // 64MB cache
    logger.debug('Set cache size to 64MB');

    // Set temp store to memory for better performance
    db.pragma('temp_store = MEMORY');
    logger.debug('Set temp store to memory');

    // Set mmap size for memory-mapped I/O (128MB)
    db.pragma('mmap_size = 134217728');
    logger.debug('Set mmap size to 128MB');

    logger.info('Database initialized successfully', {
      path: DATABASE_PATH,
      walMode: db.pragma('journal_mode', { simple: true }),
      synchronous: db.pragma('synchronous', { simple: true })
    });

    return db;
  } catch (error) {
    logger.error('Failed to initialize database', {
      error: error.message,
      stack: error.stack,
      path: DATABASE_PATH
    });
    throw new Error(`Database initialization failed: ${error.message}`, {
      cause: error
    });
  }
}

/**
 * Get the current database instance
 * @returns {Database|null} Database instance or null if not initialized
 */
export function getDatabase() {
  if (!db) {
    logger.warn('Database accessed before initialization');
  }
  return db;
}

/**
 * Close database connection gracefully
 * Ensures all pending transactions are completed
 * @returns {void}
 */
export function closeDatabase() {
  if (!db) {
    logger.debug('No database connection to close');
    return;
  }

  try {
    logger.info('Closing database connection');

    // Checkpoint WAL file to ensure all data is written
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      logger.debug('WAL checkpoint completed');
    } catch (checkpointError) {
      logger.warn('WAL checkpoint failed during close', {
        error: checkpointError.message
      });
    }

    // Close the database
    db.close();
    db = null;

    logger.info('Database connection closed successfully');
  } catch (error) {
    logger.error('Error closing database', {
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Failed to close database: ${error.message}`, {
      cause: error
    });
  }
}

/**
 * Check if database is healthy and responsive
 * Executes a simple query to verify connectivity
 * @returns {boolean} True if database is healthy, false otherwise
 */
export function isDatabaseHealthy() {
  if (!db) {
    logger.warn('Database health check failed: not initialized');
    return false;
  }

  try {
    // Execute simple query to verify database is responsive
    const result = db.prepare('SELECT 1 as health').get();
    
    if (result && result.health === 1) {
      logger.debug('Database health check passed');
      return true;
    }

    logger.warn('Database health check returned unexpected result', { result });
    return false;
  } catch (error) {
    logger.error('Database health check failed', {
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    return false;
  }
}

/**
 * Get database statistics for monitoring
 * @returns {Object} Database statistics including size, page count, etc.
 */
export function getDatabaseStats() {
  if (!db) {
    return null;
  }

  try {
    const pageCount = db.pragma('page_count', { simple: true });
    const pageSize = db.pragma('page_size', { simple: true });
    const walMode = db.pragma('journal_mode', { simple: true });
    const cacheSize = db.pragma('cache_size', { simple: true });

    const stats = {
      pageCount,
      pageSize,
      sizeBytes: pageCount * pageSize,
      walMode,
      cacheSize,
      path: DATABASE_PATH
    };

    logger.debug('Database statistics retrieved', stats);
    return stats;
  } catch (error) {
    logger.error('Failed to retrieve database statistics', {
      error: error.message
    });
    return null;
  }
}

// Handle process termination gracefully
const handleShutdown = (signal) => {
  logger.info(`Received ${signal}, closing database connection`);
  try {
    closeDatabase();
  } catch (error) {
    logger.error('Error during shutdown database close', {
      signal,
      error: error.message
    });
  }
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default {
  initDatabase,
  getDatabase,
  closeDatabase,
  isDatabaseHealthy,
  getDatabaseStats
};