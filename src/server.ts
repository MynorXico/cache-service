/**
 * Express server setup with middleware and routes
 */

import express from 'express';
import { CacheStore } from './core/store';
import { CacheConfig } from './core/types';
import { createHttpLogger, createLogger } from './logging';
import { createHealthRoutes } from './routes/health';
import { createKvRoutes } from './routes/kv';
import { createSwaggerRoutes } from './routes/swagger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestId } from './middleware/request-id';
import { requestTimeout } from './middleware/timeouts';
import { backpressureMiddleware } from './middleware/backpressure';
import { authGuard } from './middleware/auth-guard';
import { updateCacheMetrics, updateShardImbalance } from './metrics';

export class CacheServer {
  private app: express.Application;
  private store: CacheStore;
  private config: CacheConfig;
  private logger: any;
  private metricsInterval?: NodeJS.Timeout;

  constructor(config: CacheConfig) {
    this.config = config;
    this.logger = createLogger(config);
    this.app = express();

    // Initialize cache store
    this.store = new CacheStore(
      config.shards,
      config.maxItemBytes,
      config.memoryBudgetBytes,
      config.maxInflight,
      config.maxShardMailbox
    );

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.startMetricsCollection();
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const server = this.app.listen(this.config.port, () => {
          this.logger.info(
            {
              port: this.config.port,
              shards: this.config.shards,
              maxItemBytes: this.config.maxItemBytes,
              memoryBudgetBytes: this.config.memoryBudgetBytes,
              requestTimeoutMs: this.config.requestTimeoutMs,
              maxInflight: this.config.maxInflight,
              readRequiresAuth: this.config.readRequiresAuth,
            },
            `Cache service started on port ${this.config.port}`
          );
          resolve();
        });

        // Graceful shutdown handling
        this.setupGracefulShutdown(server);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get the Express app instance
   */
  getApp(): express.Application {
    return this.app;
  }

  /**
   * Get the cache store instance
   */
  getStore(): CacheStore {
    return this.store;
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      config: {
        port: this.config.port,
        shards: this.config.shards,
        maxItemBytes: this.config.maxItemBytes,
        memoryBudgetBytes: this.config.memoryBudgetBytes,
        requestTimeoutMs: this.config.requestTimeoutMs,
        maxInflight: this.config.maxInflight,
      },
      cache: this.store.getStats(),
    };
  }

  private setupMiddleware(): void {
    // Trust proxy for proper IP forwarding
    this.app.set('trust proxy', true);

    // Request ID middleware (must be first)
    this.app.use(requestId);

    // HTTP request logging
    this.app.use(createHttpLogger(this.logger));

    // Request timeout
    this.app.use(requestTimeout(this.config.requestTimeoutMs));

    // Backpressure control
    this.app.use(backpressureMiddleware(this.config.maxInflight));

    // JSON body parsing with generous limit (let our validation handle size limits)
    this.app.use(
      express.json({
        limit: `${Math.floor((this.config.maxItemBytes * 3) / 1024)}kb`,
        strict: true,
      })
    );

    // Authentication guard
    this.app.use(authGuard(this.config.apiToken, this.config.readRequiresAuth));
  }

  private setupRoutes(): void {
    // Health and metrics routes
    this.app.use(createHealthRoutes(this.store));

    // API documentation (Swagger UI)
    this.app.use(createSwaggerRoutes(this.config.enableSwagger));

    // Key-Value API routes
    this.app.use(createKvRoutes(this.store, this.config.maxItemBytes));

    // 404 handler for unmatched routes
    this.app.use(notFoundHandler);
  }

  private setupErrorHandling(): void {
    // Global error handler (must be last)
    this.app.use(errorHandler);
  }

  private startMetricsCollection(): void {
    // Update cache metrics every 5 seconds
    this.metricsInterval = setInterval(() => {
      try {
        const stats = this.store.getStats();
        updateCacheMetrics(stats.shards);
        updateShardImbalance(stats.imbalance);
      } catch (error) {
        this.logger.error({ error: error.message }, 'Failed to update cache metrics');
      }
    }, 5000);
  }

  private setupGracefulShutdown(server: any): void {
    const shutdown = async (signal: string) => {
      this.logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

      // Stop accepting new requests
      server.close(() => {
        this.logger.info('HTTP server closed');
      });

      // Stop metrics collection
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      // Shutdown cache store
      this.store.shutdown();

      // Give some time for in-flight requests to complete
      setTimeout(() => {
        this.logger.info('Graceful shutdown complete');
        process.exit(0);
      }, 5000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.fatal({ reason, promise }, 'Unhandled promise rejection');
      process.exit(1);
    });
  }
}
