import { describe, expect, it } from 'vitest';
import { AssignmentMutex } from '@/src/domain/concurrency';

describe('assignment serialization', () => {
  it('does not double-claim the same available staff under concurrent attempts', async () => {
    const mutex = new AssignmentMutex();
    let available = true;
    const assignments = await Promise.all(Array.from({ length: 24 }, (_, index) => mutex.run(async () => {
      await Promise.resolve();
      if (!available) return null;
      available = false;
      return `turn-${index}`;
    })));
    expect(assignments.filter(Boolean)).toHaveLength(1);
  });
});
