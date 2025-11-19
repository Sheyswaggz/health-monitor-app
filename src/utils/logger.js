import winston from 'winston';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

// Custom format for development with colors and readable output
const developmentFormat = printf(({ level, message, timestamp, requestId, ...metadata }) => {
  let msg = `${timestamp} [${level}]`;
  
  if (requestId) {
    msg += ` [${requestId}]`;
  }
  
  msg += `: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

// Determine log level from environment or default to 'info'
const logLevel = process.env.LOG_LEVEL || 'info';

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

// Create the logger instance
const logger = winston.createLogger({
  level: logLevel,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json()
  ),
  defaultMeta: { service: 'health-monitor-app' },
  transports: [
    // Error log file - only errors
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Combined log file - all logs
    new winston.transports.File({
      filename: 'combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ filename: 'exceptions.log' }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'rejections.log' }),
  ],
});

// Add console transport with appropriate formatting
if (isDevelopment) {
  logger.add(
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        developmentFormat
      ),
    })
  );
} else {
  logger.add(
    new winston.transports.Console({
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        json()
      ),
    })
  );
}

// Create a child logger with request ID
logger.withRequestId = (requestId) => {
  return logger.child({ requestId });
};

// Helper method to log with correlation ID
logger.logWithContext = (level, message, context = {}) => {
  logger.log(level, message, context);
};

export default logger;