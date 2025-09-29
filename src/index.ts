/**
 * Main application entry point
 */

import { loadConfig } from './config';
import { CacheServer } from './server';

async function main() {
  try {
    // Load configuration from environment
    const config = loadConfig();

    // Create and start the cache server
    const server = new CacheServer(config);
    await server.start();
  } catch (error) {
    console.error('Failed to start cache service:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('Application startup failed:', error);
  process.exit(1);
});
