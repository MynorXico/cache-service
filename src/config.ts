/**
 * Configuration management using environment variables
 * Follows 12-Factor App principles
 */

import { cpus } from 'os';
import { CacheConfig } from './core/types';

/**
 * Load configuration from environment variables with sensible defaults
 */
export function loadConfig(): CacheConfig {
  const config: CacheConfig = {
    port: parseInt(process.env.PORT || '8080', 10),
    apiToken: process.env.API_TOKEN || '',
    readRequiresAuth: process.env.READ_REQUIRES_AUTH === 'true',
    shards: parseInt(process.env.SHARDS || '0', 10) || cpus().length,
    maxItemBytes: parseInt(process.env.MAX_ITEM_BYTES || '268435456', 10), // 256MB
    memoryBudgetBytes: process.env.MEMORY_BUDGET_BYTES
      ? parseInt(process.env.MEMORY_BUDGET_BYTES, 10)
      : undefined,
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '2000', 10),
    maxInflight: parseInt(process.env.MAX_INFLIGHT || '1000', 10),
    maxShardMailbox: parseInt(process.env.MAX_SHARD_MAILBOX || '1000', 10),
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    enableSwagger: process.env.NODE_ENV !== 'production',
  };

  // Validation
  if (!config.apiToken) {
    throw new Error('API_TOKEN environment variable is required');
  }

  if (config.port < 1 || config.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  if (config.shards < 1) {
    throw new Error('SHARDS must be at least 1');
  }

  if (config.maxItemBytes < 1) {
    throw new Error('MAX_ITEM_BYTES must be at least 1');
  }

  if (config.requestTimeoutMs < 100) {
    throw new Error('REQUEST_TIMEOUT_MS must be at least 100');
  }

  return config;
}

/**
 * Get environment-specific settings
 */
export function getEnvironment(): 'development' | 'test' | 'production' {
  return (process.env.NODE_ENV as any) || 'development';
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return getEnvironment() === 'development';
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return getEnvironment() === 'production';
}

/**
 * Check if running in test mode
 */
export function isTest(): boolean {
  return getEnvironment() === 'test';
}
