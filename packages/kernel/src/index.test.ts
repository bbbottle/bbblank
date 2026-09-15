import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

describe('scaffold', () => {
  it.effect('vitest + effect work', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* Effect.succeed(1), 1);
    })
  );
});
