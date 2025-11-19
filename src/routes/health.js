import express from 'express';
import { isDatabaseHealthy } from '../config/database.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Health check endpoint for liveness probes
 * Lightweight check that only verifies the server is running
 * Does not check database or external dependencies
 * 
 * @route GET /health
 * @returns {Object} 200 - Health status with timestamp
 * @returns {Object} 500 - Server error (should never happen in normal operation)
 */
router.get('/health', (req, res) => {
  const timestamp = new Date().toISOString();
  
  try {
    logger.debug('Health check requested', { 
      requestId: req.id,
      timestamp 
    });

    res.status(200).json({
      status: 'healthy',
      timestamp
    });
  } catch (error) {
    // This should rarely happen, but handle gracefully
    logger.error('Health check failed unexpectedly', {
      requestId: req.id,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      status: 'unhealthy',
      timestamp,
      error: 'Internal server error'
    });
  }
});

/**
 * Readiness check endpoint for readiness probes
 * Verifies that the application is ready to serve traffic
 * Checks database connectivity and other critical dependencies
 * 
 * @route GET /ready
 * @returns {Object} 200 - Application is ready with all dependencies healthy
 * @returns {Object} 503 - Application is not ready, dependencies unavailable
 */
router.get('/ready', (req, res) => {
  const timestamp = new Date().toISOString();
  
  try {
    logger.debug('Readiness check requested', { 
      requestId: req.id,
      timestamp 
    });

    // Check database health
    const databaseHealthy = isDatabaseHealthy();

    if (databaseHealthy) {
      logger.debug('Readiness check passed', {
        requestId: req.id,
        database: 'connected',
        timestamp
      });

      res.status(200).json({
        status: 'ready',
        timestamp,
        database: 'connected'
      });
    } else {
      logger.warn('Readiness check failed: database not healthy', {
        requestId: req.id,
        database: 'disconnected',
        timestamp
      });

      res.status(503).json({
        status: 'not ready',
        timestamp,
        database: 'disconnected'
      });
    }
  } catch (error) {
    logger.error('Readiness check failed with error', {
      requestId: req.id,
      error: error.message,
      stack: error.stack,
      timestamp
    });

    res.status(503).json({
      status: 'not ready',
      timestamp,
      database: 'disconnected',
      error: 'Health check error'
    });
  }
});

export default router;