import logger from '../utils/logger.js';

/**
 * Custom error types for specific error handling
 */
class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class DatabaseError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DatabaseError';
    this.statusCode = 503;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Determines the appropriate HTTP status code for an error
 * @param {Error} err - The error object
 * @returns {number} HTTP status code
 */
const getStatusCode = (err) => {
  if (err.statusCode) {
    return err.statusCode;
  }

  switch (err.name) {
    case 'ValidationError':
      return 400;
    case 'UnauthorizedError':
    case 'AuthenticationError':
      return 401;
    case 'ForbiddenError':
    case 'AuthorizationError':
      return 403;
    case 'NotFoundError':
      return 404;
    case 'ConflictError':
      return 409;
    case 'DatabaseError':
      return 503;
    case 'TimeoutError':
      return 504;
    default:
      return 500;
  }
};

/**
 * Sanitizes error message for production environment
 * @param {Error} err - The error object
 * @param {boolean} isDevelopment - Whether running in development mode
 * @returns {string} Sanitized error message
 */
const getErrorMessage = (err, isDevelopment) => {
  if (isDevelopment) {
    return err.message;
  }

  const statusCode = getStatusCode(err);
  
  if (statusCode >= 500) {
    return 'An internal server error occurred';
  }

  return err.message;
};

/**
 * Builds error response object
 * @param {Error} err - The error object
 * @param {boolean} isDevelopment - Whether running in development mode
 * @returns {Object} Error response object
 */
const buildErrorResponse = (err, isDevelopment) => {
  const statusCode = getStatusCode(err);
  const response = {
    status: 'error',
    statusCode,
    message: getErrorMessage(err, isDevelopment),
    timestamp: new Date().toISOString(),
  };

  if (err.details && Object.keys(err.details).length > 0) {
    response.details = err.details;
  }

  if (err.code) {
    response.code = err.code;
  }

  if (isDevelopment && err.stack) {
    response.stack = err.stack.split('\n').map(line => line.trim());
  }

  return response;
};

/**
 * Logs error with appropriate context and severity
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 */
const logError = (err, req) => {
  const statusCode = getStatusCode(err);
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  
  const logContext = {
    error: {
      name: err.name,
      message: err.message,
      code: err.code,
      statusCode,
    },
    request: {
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    },
  };

  if (req.requestId) {
    logContext.requestId = req.requestId;
  }

  if (err.details) {
    logContext.error.details = err.details;
  }

  if (statusCode >= 500 && err.stack) {
    logContext.error.stack = err.stack;
  }

  logger.log(logLevel, `Request error: ${err.message}`, logContext);
};

/**
 * Express error handling middleware
 * Catches all errors, logs them with context, and returns appropriate JSON responses
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const isDevelopment = process.env.NODE_ENV !== 'production';

  logError(err, req);

  const statusCode = getStatusCode(err);
  const errorResponse = buildErrorResponse(err, isDevelopment);

  res.status(statusCode).json(errorResponse);
};

/**
 * Async error wrapper for route handlers
 * Catches async errors and passes them to error handling middleware
 * 
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 * Creates a NotFoundError for unmatched routes
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl || req.url}`);
  error.name = 'NotFoundError';
  error.statusCode = 404;
  next(error);
};

export default errorHandler;
export { 
  errorHandler, 
  asyncHandler, 
  notFoundHandler, 
  ValidationError, 
  DatabaseError 
};