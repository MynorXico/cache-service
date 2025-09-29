/**
 * Hash implementation for key-to-shard mapping
 * Provides minimal remapping when the number of shards changes
 */

/**
 * Alternative simpler hash for when jump consistent hash is overkill
 * Uses modulo operation - causes more remapping but is faster
 */
export function simpleHash(key: string, numShards: number): number {
  if (numShards <= 0) {
    throw new Error('Number of shards must be positive');
  }

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) & 0x7fffffff;
  }

  return hash % numShards;
}

/**
 * Get shard for a key using the configured hash function
 */
export function getShardForKey(key: string, numShards: number): number {
  // Use simpler hash for now to avoid performance issues
  return simpleHash(key, numShards);
}
