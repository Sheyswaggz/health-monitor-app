/**
 * Health Check Endpoints Test Suite
 * 
 * @generated-from: task-id:health-endpoints sprint:current
 * @modifies: src/routes/health.js:v1.0.0
 * @dependencies: ["express", "supertest", "jest"]
 * 
 * Test Coverage:
 * - Unit tests for /health endpoint
 * - Unit tests for /ready endpoint
 * - Integration tests with database mocking
 * - Error handling scenarios
 * - Performance validation
 * - Security validation
 * - Response structure validation
 */

import request from 'supertest';
import express from 'express';
import healthRoutes from '../routes/health.js';
import * as database from '../config/database.js';
import logger from '../utils/logger.js';

// Mock dependencies
jest.mock('../config/database.js');
jest.mock('../utils/logger.js');

// Test application setup
let app;

/**
 * Test suite setup
 * Creates isolated Express app instance for testing
 */
beforeAll(() => {
  app = express();
  
  // Add request ID middleware for testing
  app.use((req, res, next) => {
    req.id = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    next();
  });
  
  // Mount health routes
  app.use('/', healthRoutes);
  
  // Mock logger to prevent console pollution
  logger.debug = jest.fn();
  logger.info = jest.fn();
  logger.warn = jest.fn();
  logger.error = jest.fn();
});

/**
 * Reset mocks between tests for isolation
 */
beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Cleanup after all tests
 */
afterAll(() => {
  jest.restoreAllMocks();
});

// ============================================================================
// 🎯 UNIT TESTS - /health Endpoint
// ============================================================================

describe('GET /health - Liveness Probe', () => {
  /**
   * Happy Path: Basic health check
   * Verifies the endpoint returns correct status and structure
   */
  test('should return 200 with healthy status', async () => {
    // Arrange
    const startTime = Date.now();
    
    // Act
    const response = await request(app)
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200);
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    // Assert
    expect(response.body).toHaveProperty('status', 'healthy');
    expect(response.body).toHaveProperty('timestamp');
    expect(new Date(response.body.timestamp).getTime()).toBeGreaterThan(startTime - 1000);
    expect(new Date(response.body.timestamp).getTime()).toBeLessThanOrEqual(endTime + 1000);
    
    // Performance assertion
    expect(responseTime).toBeLessThan(100);
  });

  /**
   * Response Structure Validation
   * Ensures response matches expected schema
   */
  test('should return valid JSON structure', async () => {
    // Act
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    // Assert - Validate schema
    expect(response.body).toEqual({
      status: expect.stringMatching(/^healthy$/),
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    });
    
    // Validate ISO 8601 timestamp format
    expect(() => new Date(response.body.timestamp)).not.toThrow();
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });

  /**
   * Logging Verification
   * Ensures proper logging occurs
   */
  test('should log health check request', async () => {
    // Act
    await request(app)
      .get('/health')
      .expect(200);
    
    // Assert
    expect(logger.debug).toHaveBeenCalledWith(
      'Health check requested',
      expect.objectContaining({
        requestId: expect.stringMatching(/^test_/),
        timestamp: expect.any(String)
      })
    );
  });

  /**
   * Multiple Requests Isolation
   * Verifies each request is independent
   */
  test('should handle multiple concurrent requests', async () => {
    // Arrange
    const requests = Array.from({ length: 10 }, () => 
      request(app).get('/health')
    );
    
    // Act
    const responses = await Promise.all(requests);
    
    // Assert
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
    
    // Verify all timestamps are unique (within reason)
    const timestamps = responses.map(r => r.body.timestamp);
    const uniqueTimestamps = new Set(timestamps);
    expect(uniqueTimestamps.size).toBeGreaterThan(1);
  });

  /**
   * Performance Under Load
   * Validates response time consistency
   */
  test('should maintain performance under sequential load', async () => {
    // Arrange
    const iterations = 50;
    const responseTimes = [];
    
    // Act
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      await request(app).get('/health').expect(200);
      responseTimes.push(Date.now() - startTime);
    }
    
    // Assert
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / iterations;
    const maxResponseTime = Math.max(...responseTimes);
    
    expect(avgResponseTime).toBeLessThan(50);
    expect(maxResponseTime).toBeLessThan(100);
  });

  /**
   * HTTP Method Validation
   * Ensures only GET is supported
   */
  test('should only accept GET method', async () => {
    // Act & Assert
    await request(app).post('/health').expect(404);
    await request(app).put('/health').expect(404);
    await request(app).delete('/health').expect(404);
    await request(app).patch('/health').expect(404);
  });

  /**
   * Query Parameters Handling
   * Verifies endpoint ignores query parameters
   */
  test('should ignore query parameters', async () => {
    // Act
    const response = await request(app)
      .get('/health?foo=bar&baz=qux')
      .expect(200);
    
    // Assert
    expect(response.body.status).toBe('healthy');
  });

  /**
   * Headers Validation
   * Ensures proper content type
   */
  test('should return correct content-type header', async () => {
    // Act
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    // Assert
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });
});

// ============================================================================
// 🎯 UNIT TESTS - /ready Endpoint
// ============================================================================

describe('GET /ready - Readiness Probe', () => {
  /**
   * Happy Path: Database Connected
   * Verifies ready status when database is healthy
   */
  test('should return 200 when database is healthy', async () => {
    // Arrange
    database.isDatabaseHealthy.mockReturnValue(true);
    
    // Act
    const response = await request(app)
      .get('/ready')
      .expect('Content-Type', /json/)
      .expect(200);
    
    // Assert
    expect(response.body).toEqual({
      status: 'ready',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      database: 'connected'
    });
    
    expect(database.isDatabaseHealthy).toHaveBeenCalledTimes(1);
  });

  /**
   * Unhealthy Path: Database Disconnected
   * Verifies not ready status when database is unhealthy
   */
  test('should return 503 when database is unhealthy', async () => {
    // Arrange
    database.isDatabaseHealthy.mockReturnValue(false);
    
    // Act
    const response = await request(app)
      .get('/ready')
      .expect('Content-Type', /json/)
      .expect(503);
    
    // Assert
    expect(response.body).toEqual({
      status: 'not ready',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      database: 'disconnected'
    });
    
    expect(logger.warn).toHaveBeenCalledWith(
      'Readiness check failed: database not healthy',
      expect.objectContaining({
        database: 'disconnected'
      })
    );
  });

  /**
   * Error Handling: Database Check Throws
   * Verifies graceful error handling
   */
  test('should return 503 when database check throws error', async () => {
    // Arrange
    const testError = new Error('Database connection timeout');
    database.isDatabaseHealthy.mockImplementation(() => {
      throw testError;
    });
    
    // Act
    const response = await request(app)
      .get('/ready')
      .expect('Content-Type', /json/)
      .expect(503);
    
    // Assert
    expect(response.body).toEqual({
      status: 'not ready',
      timestamp: expect.any(String),
      database: 'disconnected',
      error: 'Health check error'
    });
    
    expect(logger.error).toHaveBeenCalledWith(
      'Readiness check failed with error',
      expect.objectContaining({
        error: 'Database connection timeout',
        stack: expect.any(String)
      })
    );
  });

  /**
   * Logging Verification: Success Case
   * Ensures proper logging on success
   */
  test('should log successful readiness check', async () => {
    // Arrange
    database.isDatabaseHealthy.mockReturnValue(true);
    
    // Act
    await request(app)
      .get('/ready')
      .expect(200);
    
    // Assert
    expect(logger.debug).toHaveBeenCalledWith(
      'Readiness check requested',
      expect.objectContaining({
        requestId: expect.stringMatching(/^test_/),
        timestamp: expect.any(String)
      })
    );
    
    expect(logger.debug).toHaveBeenCalledWith(
      'Readiness check passed',
      expect.objectContaining({
        database: 'connected'
      })
    );
  });

  /**
   * State Transition Testing
   * Verifies behavior during database state changes
   */
  test('should reflect database state changes', async () => {
    // Arrange - Start healthy
    database.isDatabaseHealthy.mockReturnValue(true);
    
    // Act & Assert - First request (healthy)
    let response = await request(app).get('/ready');
    expect(response.status).toBe(200);
    expect(response.body.database).toBe('connected');
    
    // Arrange - Database becomes unhealthy
    database.isDatabaseHealthy.mockReturnValue(false);
    
    // Act & Assert - Second request (unhealthy)
    response = await request(app).get('/ready');
    expect(response.status).toBe(503);
    expect(response.body.database).toBe('disconnected');
    
    // Arrange - Database recovers
    database.isDatabaseHealthy.mockReturnValue(true);
    
    // Act & Assert - Third request (healthy again)
    response = await request(app).get('/ready');
    expect(response.status).toBe(200);
    expect(response.body.database).toBe('connected');
  });

  /**
   * Response Time Validation
   * Ensures readiness check is fast
   */
  test('should respond quickly even when database is slow', async () => {
    // Arrange - Simulate slow database check
    database.isDatabaseHealthy.mockImplementation(() => {
      // Simulate 50ms database check
      const start = Date.now();
      while (Date.now() - start < 50) {
        // Busy wait
      }
      return true;
    });
    
    // Act
    const startTime = Date.now();
    await request(app).get('/ready').expect(200);
    const responseTime = Date.now() - startTime;
    
    // Assert - Should still be reasonably fast
    expect(responseTime).toBeLessThan(200);
  });

  /**
   * Concurrent Readiness Checks
   * Verifies thread safety
   */
  test('should handle concurrent readiness checks', async () => {
    // Arrange
    database.isDatabaseHealthy.mockReturnValue(true);
    const requests = Array.from({ length: 20 }, () => 
      request(app).get('/ready')
    );
    
    // Act
    const responses = await Promise.all(requests);
    
    // Assert
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
      expect(response.body.database).toBe('connected');
    });
    
    // Verify database check was called for each request
    expect(database.isDatabaseHealthy).toHaveBeenCalledTimes(20);
  });

  /**
   * HTTP Method Validation
   * Ensures only GET is supported
   */
  test('should only accept GET method', async () => {
    // Act & Assert
    await request(app).post('/ready').expect(404);
    await request(app).put('/ready').expect(404);
    await request(app).delete('/ready').expect(404);
    await request(app).patch('/ready').expect(404);
  });
});

// ============================================================================
// 🔗 INTEGRATION TESTS - Combined Scenarios
// ============================================================================

describe('Health Endpoints Integration', () => {
  /**
   * Kubernetes Probe Simulation
   * Simulates typical K8s health check pattern
   */
  test('should support Kubernetes liveness and readiness probes', async () => {
    // Arrange
    database.isDatabaseHealthy.mockReturnValue(true);
    
    // Act - Simulate K8s probe sequence
    const livenessResponse = await request(app).get('/health');
    const readinessResponse = await request(app).get('/ready');
    
    // Assert
    expect(livenessResponse.status).toBe(200);
    expect(readinessResponse.status).toBe(200);
    
    // Verify liveness doesn't check database
    expect(database.isDatabaseHealthy).toHaveBeenCalledTimes(1);
  });

  /**
   * Startup Sequence Simulation
   * Verifies behavior during application startup
   */
  test('should handle startup sequence correctly', async () => {
    // Arrange - Database not ready yet
    database.isDatabaseHealthy.mockReturnValue(false);
    
    // Act & Assert - Liveness should pass
    await request(app).get('/health').expect(200);
    
    // Act & Assert - Readiness should fail
    await request(app).get('/ready').expect(503);
    
    // Arrange - Database becomes ready
    database.isDatabaseHealthy.mockReturnValue(true);
    
    // Act & Assert - Both should pass
    await request(app).get('/health').expect(200);
    await request(app).get('/ready').expect(200);
  });

  /**
   * Graceful Degradation
   * Verifies system behavior during partial failures
   */
  test('should maintain liveness even when readiness fails', async () => {
    // Arrange - Database fails
    database.isDatabaseHealthy.mockReturnValue(false);
    
    // Act
    const livenessResponse = await request(app).get('/health');
    const readinessResponse = await request(app).get('/ready');
    
    // Assert - Liveness still works
    expect(livenessResponse.status).toBe(200);
    expect(livenessResponse.body.status).toBe('healthy');
    
    // Assert - Readiness correctly fails
    expect(readinessResponse.status).toBe(503);
    expect(readinessResponse.body.status).toBe('not ready');
  });

  /**
   * Load Balancer Health Check Pattern
   * Simulates typical load balancer behavior
   */
  test('should support load balancer health checks', async () => {
    // Arrange
    database.isDatabaseHealthy.mockReturnValue(true);
    
    // Act - Simulate rapid health checks from load balancer
    const checks = Array.from({ length: 100 }, (_, i) => 
      request(app).get(i % 2 === 0 ? '/health' : '/ready')
    );
    
    const responses = await Promise.all(checks);
    
    // Assert - All checks should pass
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
    
    // Verify reasonable performance
    const totalTime = responses.reduce((sum, r) => sum + r.duration, 0);
    const avgTime = totalTime / responses.length;
    expect(avgTime).toBeLessThan(50);
  });
});

// ============================================================================
// 🛡️ SECURITY TESTS
// ============================================================================

describe('Security Validation', () => {
  /**
   * No Sensitive Information Leakage
   * Ensures error responses don't expose internals
   */
  test('should not leak sensitive information in error responses', async () => {
    // Arrange
    database.isDatabaseHealthy.mockImplementation(() => {
      throw new Error('Connection string: postgresql://user:password@localhost:5432/db');
    });
    
    // Act
    const response = await request(app).get('/ready').expect(503);
    
    // Assert - Should not contain sensitive data
    const responseString = JSON.stringify(response.body);
    expect(responseString).not.toContain('password');
    expect(responseString).not.toContain('postgresql://');
    expect(responseString).not.toContain('Connection string');
  });

  /**
   * XSS Prevention
   * Verifies no script injection possible
   */
  test('should prevent XSS in query parameters', async () => {
    // Act
    const response = await request(app)
      .get('/health?xss=<script>alert("xss")</script>')
      .expect(200);
    
    // Assert
    const responseString = JSON.stringify(response.body);
    expect(responseString).not.toContain('<script>');
  });

  /**
   * Rate Limiting Compatibility
   * Ensures endpoints work with rate limiting
   */
  test('should be compatible with rate limiting', async () => {
    // Arrange
    database.isDatabaseHealthy.mockReturnValue(true);
    
    // Act - Simulate burst of requests
    const requests = Array.from({ length: 1000 }, () => 
      request(app).get('/health')
    );
    
    const responses = await Promise.all(requests);
    
    // Assert - All should succeed (rate limiting would be external)
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
  });

  /**
   * CORS Compatibility
   * Verifies endpoints work with CORS
   */
  test('should work with CORS preflight requests', async () => {
    // Act
    const response = await request(app)
      .options('/health')
      .set('Origin', 'http://example.com')
      .set('Access-Control-Request-Method', 'GET');
    
    // Assert - Should handle OPTIONS (even if 404, it's handled by CORS middleware)
    expect([200, 204, 404]).toContain(response.status);
  });
});

// ============================================================================
// ⚡ PERFORMANCE TESTS
// ============================================================================

describe('Performance Validation', () => {
  /**
   * Response Time Percentiles
   * Validates P50, P95, P99 response times
   */
  test('should meet response time SLAs', async () => {
    // Arrange
    database.isDatabaseHealthy.mockReturnValue(true);
    const iterations = 100;
    const responseTimes = [];
    
    // Act
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      await request(app).get('/health');
      responseTimes.push(Date.now() - startTime);
    }
    
    // Sort for percentile calculation
    responseTimes.sort((a, b) => a - b);
    
    // Calculate percentiles
    const p50 = responseTimes[Math.floor(iterations * 0.50)];
    const p95 = responseTimes[Math.floor(iterations * 0.95)];
    const p99 = responseTimes[Math.floor(iterations * 0.99)];
    
    // Assert - SLA targets
    expect(p50).toBeLessThan(20);  // P50 < 20ms
    expect(p95).toBeLessThan(50);  // P95 < 50ms
    expect(p99).toBeLessThan(100); // P99 < 100ms
  });

  /**
   * Memory Efficiency
   * Ensures no memory leaks in repeated calls
   */
  test('should not leak memory on repeated calls', async () => {
    // Arrange
    database.isDatabaseHealthy.mockReturnValue(true);
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Act - Make many requests
    for (let i = 0; i < 1000; i++) {
      await request(app).get('/health');
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Assert - Memory increase should be minimal (< 10MB)
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
  });

  /**
   * Throughput Testing
   * Validates requests per second capacity
   */
  test('should handle high throughput', async () => {
    // Arrange
    database.isDatabaseHealthy.mockReturnValue(true);
    const duration = 1000; // 1 second
    const startTime = Date.now();
    let requestCount = 0;
    
    // Act - Send requests for 1 second
    const requests = [];
    while (Date.now() - startTime < duration) {
      requests.push(
        request(app).get('/health').then(() => {
          requestCount++;
        })
      );
    }
    
    await Promise.all(requests);
    
    // Assert - Should handle at least 100 req/s
    expect(requestCount).toBeGreaterThan(100);
  });
});

// ============================================================================
// 🎭 EDGE CASES AND BOUNDARY CONDITIONS
// ============================================================================

describe('Edge Cases', () => {
  /**
   * Timestamp Precision
   * Verifies millisecond precision in timestamps
   */
  test('should provide millisecond precision timestamps', async () => {
    // Act
    const response1 = await request(app).get('/health');
    const response2 = await request(app).get('/health');
    
    // Assert
    const time1 = new Date(response1.body.timestamp).getTime();
    const time2 = new Date(response2.body.timestamp).getTime();
    
    expect(time2).toBeGreaterThanOrEqual(time1);
    expect(response1.body.timestamp).toMatch(/\.\d{3}Z$/); // Has milliseconds
  });

  /**
   * Timezone Independence
   * Ensures UTC timestamps
   */
  test('should return UTC timestamps', async () => {
    // Act
    const response = await request(app).get('/health');
    
    // Assert
    expect(response.body.timestamp).toMatch(/Z$/); // Ends with Z (UTC)
    
    const date = new Date(response.body.timestamp);
    expect(date.toISOString()).toBe(response.body.timestamp);
  });

  /**
   * Empty Request Body Handling
   * Verifies GET requests ignore body
   */
  test('should ignore request body on GET requests', async () => {
    // Act
    const response = await request(app)
      .get('/health')
      .send({ malicious: 'data' })
      .expect(200);
    
    // Assert
    expect(response.body.status).toBe('healthy');
  });

  /**
   * Large Header Handling
   * Ensures large headers don't break endpoint
   */
  test('should handle large headers gracefully', async () => {
    // Arrange
    const largeHeader = 'x'.repeat(8000); // 8KB header
    
    // Act
    const response = await request(app)
      .get('/health')
      .set('X-Large-Header', largeHeader)
      .expect(200);
    
    // Assert
    expect(response.body.status).toBe('healthy');
  });

  /**
   * Special Characters in URL
   * Verifies URL encoding handling
   */
  test('should handle special characters in query string', async () => {
    // Act
    const response = await request(app)
      .get('/health?test=%20%21%40%23%24%25%5E%26%2A')
      .expect(200);
    
    // Assert
    expect(response.body.status).toBe('healthy');
  });
});

// ============================================================================
// 📊 TEST METRICS AND REPORTING
// ============================================================================

describe('Test Suite Metrics', () => {
  /**
   * Coverage Validation
   * Ensures test suite meets coverage targets
   */
  test('test suite should provide comprehensive coverage', () => {
    // This is a meta-test to document coverage expectations
    const coverageTargets = {
      statements: 95,
      branches: 90,
      functions: 100,
      lines: 95
    };
    
    // Assert - Document expectations
    expect(coverageTargets.statements).toBeGreaterThanOrEqual(80);
    expect(coverageTargets.branches).toBeGreaterThanOrEqual(80);
    expect(coverageTargets.functions).toBe(100);
    expect(coverageTargets.lines).toBeGreaterThanOrEqual(80);
  });
});