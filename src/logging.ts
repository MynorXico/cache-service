/**
 * Structured logging with Pino
 * Provides request-scoped logging with correlation IDs
 */

import pino from 'pino';
import pinoHttp from 'pino-http';
import { ulid } from 'ulid';
import { CacheConfig } from './core/types';

/**
 * Create the main application logger
 */
export function createLogger(config: CacheConfig) {
  return pino({
    level: config.logLevel,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers["x-api-token"]'],
      censor: '[REDACTED]',
    },
  });
}

/**
 * Create HTTP request logging middleware
 */
export function createHttpLogger(logger: pino.Logger) {
  return pinoHttp({
    logger,
    genReqId: () => ulid(),
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        headers: {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
          'content-length': req.headers['content-length'],
        },
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 400 && res.statusCode < 500) {
        return 'warn';
      } else if (res.statusCode >= 500 || err) {
        return 'error';
      } else if (res.statusCode >= 300 && res.statusCode < 400) {
        return 'info';
      }
      return 'info';
    },
    customSuccessMessage: (req, res) => {
      if (req.url === '/healthz' || req.url === '/readyz') {
        return undefined; // Don't log health checks
      }
      return `${req.method} ${req.url} - ${res.statusCode}`;
    },
    customErrorMessage: (req, res, err) => {
      return `${req.method} ${req.url} - ${res.statusCode} - ${err.message}`;
    },
  });
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(logger: pino.Logger, context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Log cache operation with performance metrics
 */
export function logCacheOperation(
  logger: pino.Logger,
  operation: string,
  key: string,
  shard: number,
  latencyMs: number,
  success: boolean,
  error?: string
) {
  logger.info(
    {
      operation,
      key: key.length > 50 ? `${key.substring(0, 50)}...` : key, // Truncate long keys
      shard,
      latencyMs,
      success,
      error,
    },
    `Cache ${operation} ${success ? 'succeeded' : 'failed'}`
  );
}

/**
 * Log shard statistics
 */
export function logShardStats(logger: pino.Logger, shardId: number, stats: any) {
  logger.debug(
    {
      shard: shardId,
      ...stats,
    },
    'Shard statistics'
  );
}

/**
 * Create OpenTelemetry tracing hooks (stubs for future implementation)
 */
export class TracingHooks {
  private logger: pino.Logger;

  constructor(logger: pino.Logger) {
    this.logger = logger;
  }

  /**
   * Start a new span for cache operation
   */
  startSpan(operation: string, attributes: Record<string, unknown> = {}) {
    // Stub for OpenTelemetry span creation
    const spanId = ulid();
    this.logger.debug(
      {
        spanId,
        operation,
        attributes,
        traceEvent: 'span.start',
      },
      `Starting span: ${operation}`
    );

    return {
      spanId,
      end: (success: boolean, error?: string) => {
        this.logger.debug(
          {
            spanId,
            operation,
            success,
            error,
            traceEvent: 'span.end',
          },
          `Ending span: ${operation}`
        );
      },
      addAttribute: (key: string, value: unknown) => {
        this.logger.debug({
          spanId,
          attribute: { [key]: value },
          traceEvent: 'span.attribute',
        });
      },
    };
  }

  /**
   * Create a child span
   */
  createChildSpan(parentSpanId: string, operation: string) {
    const spanId = ulid();
    this.logger.debug(
      {
        spanId,
        parentSpanId,
        operation,
        traceEvent: 'child_span.start',
      },
      `Starting child span: ${operation}`
    );

    return this.startSpan(operation);
  }
}
