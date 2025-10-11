import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeWeightedOrder,
  computeSuffixBounds,
  DEFAULT_TOP_K,
} from '../static/solver-core.js';

test('computeWeightedOrder sorts indices by max absolute coefficient', () => {
  const vectors = [
    [0, 2, -1],
    [0, 0, 0],
    [5, 0, 0],
    [-1, -1, -1],
  ];
  assert.deepStrictEqual(computeWeightedOrder(vectors), [2, 0, 3, 1]);
});

test('computeWeightedOrder handles invalid input gracefully', () => {
  // @ts-ignore testing defensive branch
  assert.deepStrictEqual(computeWeightedOrder(null), []);
});

test('computeSuffixBounds returns aggregated ranges for ordered vectors', () => {
  const vectors = [
    [1, -2],
    [-3, 4],
  ];
  const minCounts = [1, 0];
  const maxCounts = [3, 2];
  const { suffixMinCounts, suffixLo, suffixHi } = computeSuffixBounds(
    vectors,
    minCounts,
    maxCounts,
    2,
  );
  assert.deepStrictEqual(suffixMinCounts, [1, 0, 0]);
  assert.deepStrictEqual(suffixLo, [
    [-5, -6],
    [-6, 0],
    [0, 0],
  ]);
  assert.deepStrictEqual(suffixHi, [
    [3, 6],
    [0, 8],
    [0, 0],
  ]);
});

test('DEFAULT_TOP_K exposes solver default value', () => {
  assert.strictEqual(DEFAULT_TOP_K, 10);
});
