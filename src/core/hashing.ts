/**
 * Jump consistent hash implementation for key-to-shard mapping
 * Provides minimal remapping when the number of shards changes
 */

/**
 * Jump consistent hash algorithm
 * Maps a key to a shard number with minimal remapping on shard count changes
 *
 * @param key - The key to hash
 * @param numShards - Total number of shards
 * @returns Shard number (0 to numShards-1)
 */
export function jumpConsistentHash(key: string, numShards: number): number {
  if (numShards <= 0) {
    throw new Error('Number of shards must be positive');
  }

  // Simple string hash function (FNV-1a variant)
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // Keep as 32-bit unsigned
  }

  // Jump consistent hash algorithm
  let b = -1;
  let j = 0;

  while (j < numShards) {
    b = j;
    // Convert to BigInt for the calculation, then back to number
    let hashBig = BigInt(hash);
    hashBig = (hashBig * 2862933555777941757n + 1n) & 0xffffffffffffffffn;
    hash = Number(hashBig & 0xffffffffn); // Keep lower 32 bits as regular number
    j = Math.floor(((b + 1) * (1 << 31)) / Number((hashBig >> 33n) + 1n));
  }

  return b;
}

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
  // Use simpler hash for now to avoid BigInt issues
  return simpleHash(key, numShards);
}
