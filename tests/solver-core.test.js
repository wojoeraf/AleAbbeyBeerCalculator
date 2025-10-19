import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeWeightedOrder,
  computeSuffixBounds,
  DEFAULT_TOP_K,
  solveRecipe,
} from '../static/solver-core.js';

const SAMPLE_ATTRS = ['taste', 'color', 'strength', 'foam'];

const SAMPLE_STYLES = {
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

const SAMPLE_INGREDIENTS = [
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

const createNumericIntervals = () =>
  Object.fromEntries(
    SAMPLE_ATTRS.map((attr) => [attr, [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]]),
  );

const createBandPreferences = (band) =>
  Object.fromEntries(
    SAMPLE_ATTRS.map((attr) => {
      if (!band) {
        return [attr, null];
      }
      return [attr, [band]];
    }),
  );

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
  assert.strictEqual(DEFAULT_TOP_K, 3);
});

test('solveRecipe finds a light ale all-green combination', () => {
  const numericIntervals = createNumericIntervals();
  const bandPreferences = createBandPreferences('green');
  const result = solveRecipe({
    styleName: 'light_ale',
    numericIntervals,
    bandPreferences,
    totalCap: 25,
    perCap: 25,
    extraMinCounts: {},
    allowedIngredientIds: null,
    topK: 5,
    attrs: SAMPLE_ATTRS,
    styles: SAMPLE_STYLES,
    ingredients: SAMPLE_INGREDIENTS,
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
  assert.ok(
    Number.isFinite(result.totalSolutions),
    'expected totalSolutions to be a finite number',
  );
  assert.ok(
    result.totalSolutions >= result.solutions.length,
    `expected totalSolutions >= solutions.length, got ${result.totalSolutions} vs ${result.solutions.length}`,
  );
  assert.ok(
    Number.isFinite(result.visitedStates),
    'expected visitedStates to be a finite number',
  );
  assert.ok(
    Number.isFinite(result.maxStateVisits) && result.maxStateVisits > 0,
    `expected positive maxStateVisits, got ${result.maxStateVisits}`,
  );
  assert.strictEqual(typeof result.aborted, 'boolean', 'expected aborted to be boolean');
  assert.ok(
    [null, 'user', 'limit'].includes(result.abortReason ?? null),
    `expected abortReason to be null, "user", or "limit", got ${result.abortReason}`,
  );
});

test('solveRecipe excludes unchecked optional ingredients', () => {
  const numericIntervals = createNumericIntervals();
  const bandPreferences = createBandPreferences('green');
  const result = solveRecipe({
    styleName: 'light_ale',
    numericIntervals,
    bandPreferences,
    totalCap: 25,
    perCap: 25,
    extraMinCounts: {},
    allowedIngredientIds: [],
    topK: 5,
    attrs: SAMPLE_ATTRS,
    styles: SAMPLE_STYLES,
    ingredients: SAMPLE_INGREDIENTS,
    translate: () => 'msg',
    displayStyleName: (id) => id,
  });
  assert.ok(result.solutions.length > 0, 'expected a solution using only required ingredients');
  const best = result.solutions[0];
  const requiredIds = Object.keys(SAMPLE_STYLES.light_ale.min_counts);
  SAMPLE_INGREDIENTS.forEach((ingredient, index) => {
    const count = best.x[index] || 0;
    const isRequired = requiredIds.includes(ingredient.id);
    if (isRequired) {
      const requiredMin = SAMPLE_STYLES.light_ale.min_counts[ingredient.id] || 0;
      assert.ok(count >= requiredMin, `expected required ingredient ${ingredient.id} to meet its minimum`);
    } else {
      assert.strictEqual(count, 0, `expected ${ingredient.id} to be excluded`);
      assert.ok(!(ingredient.id in best.countsById), `expected ${ingredient.id} to be absent from countsById`);
    }
  });
});

test('solveRecipe trims large optional sets when hitting search limit', () => {
  const optionalCount = 40;
  const attrs = SAMPLE_ATTRS;
  const ingredients = [
    { id: 'base_malt', vec: [0.2, 0.1, 0.1, 0.1], cost: 1 },
    ...Array.from({ length: optionalCount }, (_, idx) => ({
      id: `optional_${idx}`,
      vec: [0.05, 0.02, 0.01, 0.03],
      cost: 1 + (idx % 3),
    })),
  ];
  const style = {
    overloaded: {
      base: [0, 0, 0, 0],
      min_counts: { base_malt: 1 },
      bands: {},
    },
  };
  const numericIntervals = Object.fromEntries(
    attrs.map((attr) => [attr, [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]]),
  );
  const bandPreferences = Object.fromEntries(attrs.map((attr) => [attr, null]));
  const translate = (key, replacements = {}) => {
    if (key === 'solver_trimmed_optional') {
      return `trimmed ${replacements.kept}/${replacements.total}`;
    }
    if (key === 'solver_search_timeout') {
      return 'timeout';
    }
    if (key === 'solver_search_partial') {
      return 'partial';
    }
    if (key === 'unknown_style') {
      return 'unknown';
    }
    return key;
  };
  const result = solveRecipe({
    styleName: 'overloaded',
    numericIntervals,
    bandPreferences,
    totalCap: 5,
    perCap: 5,
    extraMinCounts: {},
    allowedIngredientIds: ingredients.map((ing) => ing.id),
    topK: 5,
    maxStateVisits: 15,
    attrs,
    styles: style,
    ingredients,
    translate,
    displayStyleName: (id) => id,
  });
  assert.ok(result.solutions.length > 0, 'expected fallback run to produce solutions');
  assert.ok(
    result.info.includes('trimmed 8/40'),
    `expected trim message, got ${result.info.join(', ')}`,
  );
});

test('solveRecipe reports visited states when aborted manually', () => {
  const numericIntervals = createNumericIntervals();
  const bandPreferences = createBandPreferences(null);
  let abortFlag = false;
  const threshold = 8;
  const result = solveRecipe({
    styleName: 'light_ale',
    numericIntervals,
    bandPreferences,
    totalCap: 25,
    perCap: 25,
    extraMinCounts: {},
    allowedIngredientIds: null,
    topK: 5,
    attrs: SAMPLE_ATTRS,
    styles: SAMPLE_STYLES,
    ingredients: SAMPLE_INGREDIENTS,
    allowOptionalTrim: false,
    progressInterval: 1,
    onProgress: ({ visitedStates }) => {
      if (visitedStates >= threshold) {
        abortFlag = true;
      }
    },
    shouldAbort: () => abortFlag,
    translate: (key, replacements = {}) => {
      if (key === 'solver_search_stopped') {
        return `stopped ${replacements.visited}`;
      }
      return key;
    },
    displayStyleName: (id) => id,
  });

  assert.ok(result.aborted, 'expected solver to abort');
  assert.strictEqual(result.abortReason, 'user');
  assert.ok(
    result.visitedStates >= threshold,
    `expected visitedStates >= ${threshold}, got ${result.visitedStates}`,
  );
  assert.ok(
    result.info.some((msg) => typeof msg === 'string' && msg.includes(String(threshold))),
    'expected info message to include visited count',
  );
});

test('solveRecipe reports total solutions beyond the displayed top results', () => {
  const attrs = ['virtue'];
  const styles = {
    sampler: {
      base: [0],
      min_counts: {},
      bands: {},
    },
  };
  const ingredients = [
    { id: 'alpha', vec: [0], cost: 0 },
    { id: 'beta', vec: [0], cost: 0 },
  ];
  const numericIntervals = { virtue: [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY] };
  const bandPreferences = { virtue: null };

  const result = solveRecipe({
    styleName: 'sampler',
    numericIntervals,
    bandPreferences,
    totalCap: 2,
    perCap: 2,
    extraMinCounts: {},
    allowedIngredientIds: null,
    topK: 1,
    attrs,
    styles,
    ingredients,
    translate: () => 'msg',
    displayStyleName: (id) => id,
  });

  assert.strictEqual(
    result.solutions.length,
    1,
    'expected only the top solution to be returned when topK is 1',
  );
  assert.ok(
    result.totalSolutions > result.solutions.length,
    `expected totalSolutions to exceed displayed count, got ${result.totalSolutions}`,
  );
});
