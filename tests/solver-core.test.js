import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeWeightedOrder,
  computeSuffixBounds,
  DEFAULT_TOP_K,
  solveRecipe,
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

test('solveRecipe finds a light ale all-green combination', () => {
  const attrs = ['taste', 'color', 'strength', 'foam'];
  const styles = {
    light_ale: {
      base: [0, 0, 0, 0],
      min_counts: { pale_malt: 1, standard_yeast: 1 },
      bands: {
        taste: [
          { band: 'red', min: 0, max: 0.99 },
          { band: 'green', min: 1, max: 2.99 },
          { band: 'red', min: 3, max: 10 },
        ],
        color: [
          { band: 'red', min: 0, max: 0.99 },
          { band: 'green', min: 1, max: 3.99 },
          { band: 'red', min: 4, max: 10 },
        ],
        strength: [
          { band: 'red', min: 0, max: 0.99 },
          { band: 'green', min: 1, max: 2.99 },
          { band: 'red', min: 3, max: 10 },
        ],
        foam: [
          { band: 'yellow', min: 0, max: 0.99 },
          { band: 'green', min: 1, max: 3.99 },
          { band: 'red', min: 4, max: 10 },
        ],
      },
    },
  };
  const ingredients = [
    {
      id: 'pale_malt',
      vec: [0.4, 0.3, 1.0, 0.5],
      cost: 2,
    },
    {
      id: 'standard_yeast',
      vec: [0.5, 0, -1.0, -0.5],
      cost: 2,
    },
    {
      id: 'grapes',
      vec: [1.5, 1.0, 0.5, 0.5],
      cost: 3,
    },
    {
      id: 'sugar',
      vec: [-1.0, -0.5, 2.0, -1.0],
      cost: 1,
    },
    {
      id: 'amber_malt',
      vec: [0.8, 1.2, 0.5, 0.8],
      cost: 2,
    },
  ];
  const numericIntervals = Object.fromEntries(
    attrs.map((attr) => [attr, [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]]),
  );
  const bandPreferences = Object.fromEntries(attrs.map((attr) => [attr, ['green']]));
  const result = solveRecipe({
    styleName: 'light_ale',
    numericIntervals,
    bandPreferences,
    totalCap: 25,
    perCap: 25,
    extraMinCounts: {},
    allowedIngredientIds: null,
    topK: 5,
    attrs,
    styles,
    ingredients,
    translate: () => 'msg',
    displayStyleName: (id) => id,
  });
  assert.ok(result.solutions.length > 0, 'expected at least one solution');
  const best = result.solutions[0];
  assert.deepStrictEqual(best.bands, {
    taste: 'green',
    color: 'green',
    strength: 'green',
    foam: 'green',
  });
  assert.ok(best.totalCost <= 10, 'expected affordable solution');
});
