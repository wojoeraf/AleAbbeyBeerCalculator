/**
 * @typedef {Object} Ingredient
 * @property {string} [id]
 * @property {string} [name]
 * @property {Record<string, string>} [names]
 * @property {string} [category]
 * @property {number[]} vec
 */

/**
 * @typedef {Object} StyleBand
 * @property {number} [min]
 * @property {number} [max]
 * @property {string} [band]
 */

/**
 * @typedef {Object} StyleData
 * @property {number[]} [base]
 * @property {Record<string, StyleBand[]>} [bands]
 * @property {Record<string, number>} [min_counts]
 */

/**
 * @typedef {Object} SolveRecipeParams
 * @property {string} styleName
 * @property {Record<string, [number, number]>} numericIntervals
 * @property {Record<string, string[] | null>} bandPreferences
 * @property {number} totalCap
 * @property {number} perCap
 * @property {Record<string, number>} [extraMinCounts]
 * @property {Set<string> | string[] | null} [allowedIngredientIds]
 * @property {number} [topK]
 * @property {number} [maxStateVisits]
 * @property {boolean} [allowOptionalTrim]
 * @property {string[]} attrs
 * @property {Record<string, StyleData>} styles
 * @property {Ingredient[]} ingredients
 * @property {(key: string, replacements?: Record<string, unknown>) => string} translate
 * @property {(style: string) => string} displayStyleName
 */

/**
 * @typedef {Object} SolveRecipeResult
 * @property {Array<{
 *   x: number[];
 *   sum: number;
 *   totals: number[];
 *   bands: Record<string, string>;
 *   countsById: Record<string, number>;
 *   ingredientCount: number;
 * }>} solutions
 * @property {string[]} info
 */

export const EPS = 1e-9;
export const DEFAULT_TOP_K = 3;
export const LOW_SEASON_COST_MULTIPLIER = 1.25;
export const HIGH_SEASON_COST_MULTIPLIER = 0.75;
export const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
const DEFAULT_MAX_STATE_VISITS = 1000000;
const OPTIONAL_TRIM_THRESHOLD = 18;
const OPTIONAL_TRIM_MIN = 8;
const OPTIONAL_TRIM_MAX = 18;

const SEASONAL_MULTIPLIERS = {
  spring: { malt: LOW_SEASON_COST_MULTIPLIER, fruit: HIGH_SEASON_COST_MULTIPLIER },
  summer: { hops: LOW_SEASON_COST_MULTIPLIER, malt: HIGH_SEASON_COST_MULTIPLIER },
  autumn: { hops: HIGH_SEASON_COST_MULTIPLIER },
  winter: { fruit: LOW_SEASON_COST_MULTIPLIER },
};

const normalizeSeasonalType = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const lower = value.trim().toLowerCase();
  if (!lower) {
    return '';
  }
  if (lower.includes('malt')) {
    return 'malt';
  }
  if (lower.includes('hop')) {
    return 'hops';
  }
  if (lower.includes('fruit')) {
    return 'fruit';
  }
  if (lower.includes('yeast')) {
    return 'yeast';
  }
  return lower.replace(/[^a-z]/g, '');
};

const getSeasonalMultiplier = (season, seasonalType) => {
  const normalized = normalizeSeasonalType(seasonalType);
  if (!normalized) {
    return 1;
  }
  const map = SEASONAL_MULTIPLIERS[season];
  if (map && Object.prototype.hasOwnProperty.call(map, normalized)) {
    return map[normalized];
  }
  return 1;
};

/**
 * Produces ingredient indices sorted by their maximum absolute coefficient.
 * @param {number[][]} vectors
 * @returns {number[]}
 */
export const computeWeightedOrder = (vectors) => {
  if (!Array.isArray(vectors)) {
    return [];
  }
  const weightedOrder = vectors.map((vec, idx) => {
    const coefficients = Array.isArray(vec) ? vec : [];
    let weight = 0;
    for (let k = 0; k < coefficients.length; k += 1) {
      const val = Math.abs(Number(coefficients[k]) || 0);
      if (val > weight) {
        weight = val;
      }
    }
    return { idx, weight };
  });
  weightedOrder.sort((a, b) => b.weight - a.weight);
  return weightedOrder.map((entry) => entry.idx);
};

/**
 * Computes suffix bounds for pruning.
 * @param {number[][]} vectors
 * @param {number[]} minCounts
 * @param {number[]} maxCounts
 * @param {number} attrLength
 * @returns {{ suffixMinCounts: number[]; suffixLo: number[][]; suffixHi: number[][]; }}
 */
export const computeSuffixBounds = (vectors, minCounts, maxCounts, attrLength) => {
  const orderedVectors = Array.isArray(vectors) ? vectors : [];
  const dims = Number.isInteger(attrLength) && attrLength > 0
    ? attrLength
    : orderedVectors.length > 0 && Array.isArray(orderedVectors[0])
      ? orderedVectors[0].length
      : 0;
  const n = orderedVectors.length;
  const suffixMinCounts = new Array(n + 1).fill(0);
  for (let idx = n - 1; idx >= 0; idx -= 1) {
    const minCount = Array.isArray(minCounts) ? Number(minCounts[idx]) || 0 : 0;
    suffixMinCounts[idx] = minCount + suffixMinCounts[idx + 1];
  }

  const suffixLo = Array.from({ length: n + 1 }, () => new Array(dims).fill(0));
  const suffixHi = Array.from({ length: n + 1 }, () => new Array(dims).fill(0));

  for (let idx = n - 1; idx >= 0; idx -= 1) {
    const vec = Array.isArray(orderedVectors[idx]) ? orderedVectors[idx] : [];
    const loCnt = Array.isArray(minCounts) ? Number(minCounts[idx]) || 0 : 0;
    const hiCnt = Array.isArray(maxCounts) ? Number(maxCounts[idx]) || 0 : loCnt;
    for (let k = 0; k < dims; k += 1) {
      const coef = Number(vec[k]) || 0;
      const loVal = coef >= 0 ? coef * loCnt : coef * hiCnt;
      const hiVal = coef >= 0 ? coef * hiCnt : coef * loCnt;
      suffixLo[idx][k] = loVal + suffixLo[idx + 1][k];
      suffixHi[idx][k] = hiVal + suffixHi[idx + 1][k];
    }
  }

  return { suffixMinCounts, suffixLo, suffixHi };
};

/**
 * @param {Ingredient} ingredient
 * @param {number} index
 * @returns {string}
 */
export const getIngredientId = (ingredient, index) => {
  if (ingredient && typeof ingredient.id === 'string') {
    return ingredient.id;
  }
  if (ingredient && typeof ingredient.name === 'string') {
    return ingredient.name;
  }
  return String(index);
};

/**
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number] | null}
 */
export const intersectInterval = (a, b) => {
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  return lo <= hi ? [lo, hi] : null;
};

/**
 * @param {StyleData | undefined} style
 * @param {string} attr
 * @param {number} value
 * @param {number} [eps]
 * @returns {string | null}
 */
export const detectBand = (style, attr, value, eps = EPS) => {
  if (!style || !style.bands) {
    return null;
  }
  const segments = style.bands[attr] || [];
  for (const seg of segments) {
    const min = seg.min ?? 0;
    const max = seg.max ?? 0;
    if (value >= min - eps && value <= max + eps) {
      return seg.band || null;
    }
  }
  return null;
};

/**
 * Pure recipe solver.
 * @param {SolveRecipeParams} params
 * @returns {SolveRecipeResult}
 */
export const solveRecipe = (params) => {
  const {
    styleName,
    numericIntervals,
    bandPreferences,
    totalCap,
    perCap,
    extraMinCounts = {},
    allowedIngredientIds = null,
    topK = DEFAULT_TOP_K,
    maxStateVisits: maxStateVisitsInput = DEFAULT_MAX_STATE_VISITS,
    allowOptionalTrim = true,
    attrs,
    styles,
    ingredients,
    translate,
    displayStyleName,
  } = params;

  const maxStateVisits = Number.isFinite(maxStateVisitsInput) && maxStateVisitsInput > 0
    ? Math.floor(maxStateVisitsInput)
    : DEFAULT_MAX_STATE_VISITS;

  const style = styles[styleName];
  if (!style) {
    return {
      solutions: [],
      info: [translate('unknown_style', { style: displayStyleName(styleName) })],
      totalSolutions: 0,
    };
  }

  const n = ingredients.length;
  const base = (style.base || new Array(attrs.length).fill(0)).map(Number);
  const vectors = ingredients.map((ing) => (ing.vec || new Array(attrs.length).fill(0)).map(Number));
  const baseCosts = ingredients.map((ing) => {
    if (!ing || ing.cost === undefined || ing.cost === null) {
      return 0;
    }
    const raw = Number(ing.cost);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  });
  const seasonalTypes = ingredients.map((ing) => {
    if (ing && ing.seasonal_type !== undefined && ing.seasonal_type !== null) {
      return ing.seasonal_type;
    }
    if (ing && ing.seasonalType !== undefined && ing.seasonalType !== null) {
      return ing.seasonalType;
    }
    if (ing && typeof ing.category_label === 'string') {
      return ing.category_label;
    }
    return '';
  });
  const idToIndex = new Map(ingredients.map((ing, idx) => [getIngredientId(ing, idx), idx]));

  const minCounts = new Array(n).fill(0);
  const mandatory = style.min_counts || {};
  Object.entries(mandatory).forEach(([id, cnt]) => {
    if (!idToIndex.has(id)) return;
    const idx = idToIndex.get(id);
    minCounts[idx] = Math.max(minCounts[idx], Number(cnt) || 0);
  });

  Object.entries(extraMinCounts || {}).forEach(([id, cnt]) => {
    if (!idToIndex.has(id)) return;
    const idx = idToIndex.get(id);
    minCounts[idx] = Math.max(minCounts[idx], Number(cnt) || 0);
  });

  if (minCounts.some((cnt) => cnt > perCap)) {
    return { solutions: [], info: [translate('min_exceeds_cap')], totalSolutions: 0 };
  }

  const minSum = minCounts.reduce((acc, val) => acc + val, 0);
  const adjustedTotalCap = Math.max(totalCap, minSum);
  const remainingCap = Math.max(0, adjustedTotalCap - minSum);
  let allowedSet = null;
  if (allowedIngredientIds instanceof Set) {
    allowedSet = new Set(allowedIngredientIds);
  } else if (Array.isArray(allowedIngredientIds)) {
    allowedSet = new Set(allowedIngredientIds);
  }

  const perIngredientCeilValues = new Array(n).fill(0);
  for (let idx = 0; idx < n; idx += 1) {
    const id = getIngredientId(ingredients[idx], idx);
    const required = minCounts[idx] > 0;
    const optionalAllowed = allowedSet === null || allowedSet.has(id);
    const isAllowed = required || optionalAllowed;
    perIngredientCeilValues[idx] = isAllowed ? Math.min(perCap, adjustedTotalCap) : minCounts[idx];
  }

  const requiredIngredientIds = [];
  for (let idx = 0; idx < n; idx += 1) {
    if (minCounts[idx] > 0) {
      requiredIngredientIds.push(getIngredientId(ingredients[idx], idx));
    }
  }

  const baseTotals = attrs.map((_, idx) => Number(base[idx]) || 0);
  const totalsAfterMin = baseTotals.slice();
  const attrExtraCapacity = attrs.map(() => ({ positives: [], negatives: [] }));

  for (let idx = 0; idx < n; idx += 1) {
    const vec = vectors[idx];
    const minCnt = minCounts[idx];
    for (let k = 0; k < attrs.length; k += 1) {
      const coef = vec[k] || 0;
      if (coef !== 0) {
        totalsAfterMin[k] += coef * minCnt;
      }
    }
    const perIngredientCeil = perIngredientCeilValues[idx];
    const available = Math.max(0, perIngredientCeil - minCnt);
    if (available > 0) {
      for (let k = 0; k < attrs.length; k += 1) {
        const coef = vec[k] || 0;
        if (coef > 0) {
          attrExtraCapacity[k].positives.push({ coef, available });
        } else if (coef < 0) {
          attrExtraCapacity[k].negatives.push({ coef, available });
        }
      }
    }
  }

  const perAttrIntervals = attrs.map((attr) => numericIntervals[attr]);
  const defaultAttrBounds = attrs.map((_, attrIdx) => {
    let minBound = totalsAfterMin[attrIdx];
    let maxBound = totalsAfterMin[attrIdx];
    if (remainingCap > 0) {
      let remainingForMax = remainingCap;
      const positives = attrExtraCapacity[attrIdx].positives.sort((a, b) => b.coef - a.coef);
      for (const entry of positives) {
        if (remainingForMax <= 0) break;
        const use = Math.min(entry.available, remainingForMax);
        if (use > 0) {
          maxBound += entry.coef * use;
          remainingForMax -= use;
        }
      }

      let remainingForMin = remainingCap;
      const negatives = attrExtraCapacity[attrIdx].negatives.sort((a, b) => a.coef - b.coef);
      for (const entry of negatives) {
        if (remainingForMin <= 0) break;
        const use = Math.min(entry.available, remainingForMin);
        if (use > 0) {
          minBound += entry.coef * use;
          remainingForMin -= use;
        }
      }
    }
    if (minBound > maxBound) {
      const tmp = minBound;
      minBound = maxBound;
      maxBound = tmp;
    }
    return [minBound, maxBound];
  });

  const allowedBandMap = {};
  attrs.forEach((attr) => {
    const pref = bandPreferences[attr];
    allowedBandMap[attr] = pref ? [...pref] : null;
  });

  const allowedIntervalsForAttr = (attr, allowedBands) => {
    const attrIndex = attrs.indexOf(attr);
    let startInterval = perAttrIntervals[attrIndex]
      || [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
    const defaultInterval = defaultAttrBounds[attrIndex];
    if (defaultInterval) {
      const clipped = intersectInterval(startInterval, defaultInterval);
      if (!clipped) {
        return [];
      }
      startInterval = clipped;
    }
    if (!allowedBands || allowedBands.length === 0) {
      return [startInterval];
    }
    const segments = (style.bands && style.bands[attr]) || [];
    const out = [];
    for (const band of allowedBands) {
      for (const seg of segments) {
        if (seg.band !== band) continue;
        const iv = intersectInterval(startInterval, [seg.min ?? 0, seg.max ?? 0]);
        if (!iv) continue;
        const alreadyIncluded = out.some(
          (existing) => Math.abs(existing[0] - iv[0]) < EPS && Math.abs(existing[1] - iv[1]) < EPS,
        );
        if (!alreadyIncluded) {
          out.push(iv);
        }
      }
    }
    return out;
  };

  const perAttrLists = attrs.map((attr) => allowedIntervalsForAttr(attr, allowedBandMap[attr]));
  if (perAttrLists.some((list) => list.length === 0)) {
    return { solutions: [], info: [translate('no_intervals')], totalSolutions: 0 };
  }

  const attrNeedSigns = attrs.map((_, attrIdx) => {
    const intervals = perAttrLists[attrIdx];
    if (!intervals || intervals.length === 0) {
      return 0;
    }
    let minLower = Number.POSITIVE_INFINITY;
    let maxUpper = Number.NEGATIVE_INFINITY;
    for (const interval of intervals) {
      if (!interval) continue;
      const [lo, hi] = interval;
      if (Number.isFinite(lo) && lo < minLower) {
        minLower = lo;
      }
      if (Number.isFinite(hi) && hi > maxUpper) {
        maxUpper = hi;
      }
    }
    if (!Number.isFinite(minLower) && !Number.isFinite(maxUpper)) {
      return 0;
    }
    const baseline = totalsAfterMin[attrIdx];
    if (Number.isFinite(minLower) && baseline < minLower - EPS) {
      return 1;
    }
    if (Number.isFinite(maxUpper) && baseline > maxUpper + EPS) {
      return -1;
    }
    return 0;
  });

  const weightedOrder = computeWeightedOrder(vectors);
  const weightedRank = new Map();
  weightedOrder.forEach((idx, rank) => {
    weightedRank.set(idx, rank);
  });
  const requiredIndices = [];
  const optionalEntries = [];
  for (const idx of weightedOrder) {
    if (minCounts[idx] > 0) {
      requiredIndices.push(idx);
    } else {
      const vec = vectors[idx] || [];
      let aligned = 0;
      let opposing = 0;
      let neutral = 0;
      for (let k = 0; k < attrs.length; k += 1) {
        const need = attrNeedSigns[k];
        const coef = Number(vec[k]) || 0;
        if (need > 0) {
          if (coef > 0) {
            aligned += coef;
          } else if (coef < 0) {
            opposing += Math.abs(coef);
          }
        } else if (need < 0) {
          if (coef < 0) {
            aligned += Math.abs(coef);
          } else if (coef > 0) {
            opposing += coef;
          }
        } else {
          neutral += Math.abs(coef);
        }
      }
      const cost = baseCosts[idx] > 0 ? baseCosts[idx] : 0;
      const efficiency = aligned > 0 ? (cost > 0 ? aligned / cost : aligned) : 0;
      optionalEntries.push({
        idx,
        aligned,
        opposing,
        neutral,
        efficiency,
        cost,
        rank: weightedRank.get(idx) || 0,
      });
    }
  }

  optionalEntries.sort((a, b) => {
    if (a.aligned > 0 || b.aligned > 0) {
      if (a.aligned !== b.aligned) {
        return b.aligned - a.aligned;
      }
      if (a.efficiency !== b.efficiency) {
        return b.efficiency - a.efficiency;
      }
      if (a.opposing !== b.opposing) {
        return a.opposing - b.opposing;
      }
    }
    if (a.opposing !== b.opposing) {
      return a.opposing - b.opposing;
    }
    if (a.neutral !== b.neutral) {
      return a.neutral - b.neutral;
    }
    if (a.cost !== b.cost) {
      return a.cost - b.cost;
    }
    return a.rank - b.rank;
  });

  const allowedOptionalEntries = optionalEntries.filter(
    (entry) => perIngredientCeilValues[entry.idx] > minCounts[entry.idx],
  );
  const allowedOptionalIds = allowedOptionalEntries.map((entry) =>
    getIngredientId(ingredients[entry.idx], entry.idx),
  );

  const orderedOptionalIndices = allowedOptionalEntries.map((entry) => entry.idx);
  const orderedIndices = requiredIndices.concat(orderedOptionalIndices);
  const orderLength = orderedIndices.length;
  const orderedVectors = orderedIndices.map((idx) => vectors[idx]);
  const orderedMinCounts = orderedIndices.map((idx) => minCounts[idx]);
  const orderedMaxCounts = orderedIndices.map((idx) => perIngredientCeilValues[idx]);
  const orderedCosts = orderedIndices.map((idx) => baseCosts[idx]);

  const suffixMinBaseCost = new Array(orderLength + 1).fill(0);
  for (let idx = orderLength - 1; idx >= 0; idx -= 1) {
    const minCnt = orderedMinCounts[idx];
    const unitCost = orderedCosts[idx];
    suffixMinBaseCost[idx] = unitCost * minCnt + suffixMinBaseCost[idx + 1];
  }

  const { suffixMinCounts, suffixLo, suffixHi } = computeSuffixBounds(
    orderedVectors,
    orderedMinCounts,
    orderedMaxCounts,
    attrs.length,
  );
  if (suffixMinCounts[0] > adjustedTotalCap) {
    return { solutions: [], info: [translate('cap_too_small')], totalSolutions: 0 };
  }

  const counts = new Array(orderLength).fill(0);
  const seenCombos = new Set();
  const solutions = [];
  let bestCostBound = Infinity;

  const updateBestCostBound = () => {
    if (solutions.length >= topK) {
      const worst = solutions[solutions.length - 1];
      const worstCost =
        worst && typeof worst.totalCost === 'number'
          ? worst.totalCost
          : Number.isFinite(worst && worst.averageCost)
            ? worst.averageCost
            : Infinity;
      bestCostBound = Number.isFinite(worstCost) ? worstCost : Infinity;
    } else {
      bestCostBound = Infinity;
    }
  };

  const compareSolutions = (a, b) => {
    const costA = Number.isFinite(a && a.totalCost) ? a.totalCost : Number(a && a.averageCost) || 0;
    const costB = Number.isFinite(b && b.totalCost) ? b.totalCost : Number(b && b.averageCost) || 0;
    const diffCost = costA - costB;
    if (Math.abs(diffCost) > EPS) return diffCost;

    const minCostA = Number.isFinite(a && a.minCost) ? a.minCost : costA;
    const minCostB = Number.isFinite(b && b.minCost) ? b.minCost : costB;
    const diffMin = minCostA - minCostB;
    if (Math.abs(diffMin) > EPS) return diffMin;

    const totalUnitsA = Number.isFinite(a && a.totalUnits) ? a.totalUnits : Number(a && a.sum) || 0;
    const totalUnitsB = Number.isFinite(b && b.totalUnits) ? b.totalUnits : Number(b && b.sum) || 0;
    if (totalUnitsA !== totalUnitsB) return totalUnitsA - totalUnitsB;

    const totalsA = Array.isArray(a.totals) ? a.totals : [];
    const totalsB = Array.isArray(b.totals) ? b.totals : [];
    for (let k = 0; k < attrs.length; k += 1) {
      const diff = (totalsA[k] || 0) - (totalsB[k] || 0);
      if (Math.abs(diff) > EPS) return diff;
    }
    const xA = Array.isArray(a.x) ? a.x : [];
    const xB = Array.isArray(b.x) ? b.x : [];
    const len = Math.max(xA.length, xB.length);
    for (let i = 0; i < len; i += 1) {
      const valA = xA[i] || 0;
      const valB = xB[i] || 0;
      if (valA !== valB) return valA - valB;
    }
    return 0;
  };

  const insertSolution = (solution) => {
    let inserted = false;
    for (let i = 0; i < solutions.length; i += 1) {
      if (compareSolutions(solution, solutions[i]) < 0) {
        solutions.splice(i, 0, solution);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      solutions.push(solution);
    }
    if (solutions.length > topK) {
      solutions.length = topK;
    }
    updateBestCostBound();
  };

  const infoMessages = [];
  let globalAborted = false;
  let totalSolutions = 0;

  const iterateBoxes = (attrIdx, lower, upper) => {
    if (attrIdx === attrs.length) {
      const lowerBounds = lower.slice();
      const upperBounds = upper.slice();

      const stateCostMemo = new Map();
      let visitedStates = 0;
      let aborted = false;

      const dfs = (idx, used, totals, costSoFar) => {
        if (aborted) {
          return;
        }
        visitedStates += 1;
        if (visitedStates > maxStateVisits) {
          aborted = true;
          globalAborted = true;
          return;
        }
        const roundedTotalsKey = totals
          .map((val) => (Number.isFinite(val) ? Math.round(val * 1000) : 0))
          .join(',');
        const memoKey = `${idx}|${used}|${roundedTotalsKey}`;
        const seenCost = stateCostMemo.get(memoKey);
        if (seenCost !== undefined && seenCost <= costSoFar + EPS) {
          return;
        }
        stateCostMemo.set(memoKey, costSoFar);

        if (idx >= orderLength) {
          for (let k = 0; k < attrs.length; k += 1) {
            if (totals[k] < lowerBounds[k] - EPS || totals[k] > upperBounds[k] + EPS) {
              return;
            }
          }
          const countsOriginal = new Array(n).fill(0);
          const countsById = {};
          orderedIndices.forEach((originalIdx, position) => {
            const cnt = counts[position];
            countsOriginal[originalIdx] = cnt;
            if (cnt > 0) {
              const id = getIngredientId(ingredients[originalIdx], originalIdx);
              countsById[id] = cnt;
            }
          });
          const key = countsOriginal.join('|');
          if (seenCombos.has(key)) {
            return;
          }
          seenCombos.add(key);
          totalSolutions += 1;

          const bands = {};
          for (let k = 0; k < attrs.length; k += 1) {
            const attr = attrs[k];
            bands[attr] = detectBand(style, attr, totals[k]) || 'n/a';
          }

          const totalsRounded = totals.map((val) => Math.round(val * 1000) / 1000);
          const ingredientCount = Object.keys(countsById).length;
          const totalUnits = countsOriginal.reduce((acc, val) => acc + val, 0);
          const baseCost = costSoFar;
          const seasonalCosts = {};
          const seasonTotals = [];
          let minSeasonCost = Infinity;
          let maxSeasonCost = -Infinity;
          for (const season of SEASON_ORDER) {
            let seasonTotal = 0;
            for (let originalIdx = 0; originalIdx < n; originalIdx += 1) {
              const cnt = countsOriginal[originalIdx] || 0;
              if (cnt <= 0) continue;
              const unitCost = baseCosts[originalIdx];
              if (unitCost <= 0) continue;
              const multiplier = getSeasonalMultiplier(season, seasonalTypes[originalIdx]);
              seasonTotal += unitCost * multiplier * cnt;
            }
            seasonalCosts[season] = seasonTotal;
            seasonTotals.push(seasonTotal);
            if (seasonTotal < minSeasonCost) minSeasonCost = seasonTotal;
            if (seasonTotal > maxSeasonCost) maxSeasonCost = seasonTotal;
          }
          const averageCost = seasonTotals.length
            ? seasonTotals.reduce((acc, val) => acc + val, 0) / seasonTotals.length
            : baseCost;
          const minCost = Number.isFinite(minSeasonCost) ? minSeasonCost : baseCost;
          const maxCost = Number.isFinite(maxSeasonCost) ? maxSeasonCost : baseCost;
          const solution = {
            x: countsOriginal,
            sum: totalUnits,
            totalUnits,
            totals: totalsRounded,
            bands,
            countsById,
            ingredientCount,
            baseCost,
            seasonalCosts,
            averageCost,
            minCost,
            maxCost,
            totalCost: averageCost,
          };
          insertSolution(solution);
          return;
        }

        if (used + suffixMinCounts[idx] > adjustedTotalCap) {
          return;
        }

        if (bestCostBound !== Infinity) {
          const minimalCost = costSoFar + suffixMinBaseCost[idx];
          if (minimalCost > bestCostBound + EPS) {
            return;
          }
        }

        for (let k = 0; k < attrs.length; k += 1) {
          const minPossible = totals[k] + suffixLo[idx][k];
          const maxPossible = totals[k] + suffixHi[idx][k];
          if (maxPossible < lowerBounds[k] - EPS || minPossible > upperBounds[k] + EPS) {
            return;
          }
        }

        const remainingMinAfter = suffixMinCounts[idx + 1];
        const maxC = Math.min(orderedMaxCounts[idx], adjustedTotalCap - used - remainingMinAfter);
        const minC = orderedMinCounts[idx];
        if (maxC < minC) {
          return;
        }

        const vec = orderedVectors[idx];
        const unitCost = orderedCosts[idx];

        let localMinC = minC;
        let localMaxC = maxC;
        for (let k = 0; k < attrs.length; k += 1) {
          const coef = vec[k] || 0;
          if (coef === 0) {
            continue;
          }
          const total = totals[k];
          const lowerBound = lowerBounds[k];
          const upperBound = upperBounds[k];
          const suffixLoNext = suffixLo[idx + 1][k];
          const suffixHiNext = suffixHi[idx + 1][k];
          if (coef > 0) {
            const maxNumerator = upperBound - suffixLoNext - total;
            if (Number.isFinite(maxNumerator)) {
              const allowedMax = Math.floor((maxNumerator + EPS) / coef);
              if (Number.isFinite(allowedMax)) {
                localMaxC = Math.min(localMaxC, allowedMax);
              }
            }
            const minNumerator = lowerBound - suffixHiNext - total;
            if (Number.isFinite(minNumerator)) {
              const requiredMin = Math.ceil((minNumerator - EPS) / coef);
              if (Number.isFinite(requiredMin)) {
                localMinC = Math.max(localMinC, requiredMin);
              }
            }
          } else {
            const absCoef = Math.abs(coef);
            const minNumerator = total + suffixLoNext - upperBound;
            if (Number.isFinite(minNumerator)) {
              const requiredMin = Math.ceil((minNumerator - EPS) / absCoef);
              if (Number.isFinite(requiredMin)) {
                localMinC = Math.max(localMinC, requiredMin);
              }
            }
            const maxNumerator = total + suffixHiNext - lowerBound;
            if (Number.isFinite(maxNumerator)) {
              const allowedMax = Math.floor((maxNumerator + EPS) / absCoef);
              if (Number.isFinite(allowedMax)) {
                localMaxC = Math.min(localMaxC, allowedMax);
              }
            }
          }
          if (localMinC > localMaxC) {
            break;
          }
        }

        localMinC = Math.max(localMinC, minC);
        localMaxC = Math.min(localMaxC, maxC);
        if (localMinC > localMaxC) {
          return;
        }

        for (let c = localMinC; c <= localMaxC; c += 1) {
          counts[idx] = c;
          const newTotals = totals.map((val, k) => val + (vec[k] || 0) * c);
          const newCost = costSoFar + unitCost * c;
          if (bestCostBound !== Infinity) {
            const minimalFutureCost = newCost + suffixMinBaseCost[idx + 1];
            if (minimalFutureCost > bestCostBound + EPS) {
              continue;
            }
          }
          let feasible = true;
          for (let k = 0; k < attrs.length; k += 1) {
            const minPossible = newTotals[k] + suffixLo[idx + 1][k];
            const maxPossible = newTotals[k] + suffixHi[idx + 1][k];
            if (maxPossible < lowerBounds[k] - EPS || minPossible > upperBounds[k] + EPS) {
              feasible = false;
              break;
            }
          }
          if (feasible) {
            dfs(idx + 1, used + c, newTotals, newCost);
            if (aborted) {
              break;
            }
          }
        }
        counts[idx] = 0;
        if (aborted) {
          return;
        }
      };

      dfs(0, 0, base.slice(), 0);
      if (aborted) {
        infoMessages.push(translate(
          solutions.length > 0 ? 'solver_search_partial' : 'solver_search_timeout',
        ));
      }
      return;
    }

    for (const interval of perAttrLists[attrIdx]) {
      if (globalAborted) {
        break;
      }
      lower[attrIdx] = interval[0];
      upper[attrIdx] = interval[1];
      iterateBoxes(attrIdx + 1, lower, upper);
    }
  };

  iterateBoxes(
    0,
    new Array(attrs.length).fill(Number.NEGATIVE_INFINITY),
    new Array(attrs.length).fill(Number.POSITIVE_INFINITY),
  );

  const wasGlobalAborted = globalAborted;
  solutions.sort(compareSolutions);

  if (
    allowOptionalTrim
    && wasGlobalAborted
    && solutions.length === 0
    && allowedOptionalIds.length > OPTIONAL_TRIM_THRESHOLD
  ) {
    const targetCount = Math.max(
      OPTIONAL_TRIM_MIN,
      Math.min(OPTIONAL_TRIM_MAX, remainingCap + requiredIndices.length),
    );
    const trimmedCount = Math.min(targetCount, allowedOptionalIds.length);
    if (trimmedCount < allowedOptionalIds.length) {
      const trimmedAllowedSet = new Set(requiredIngredientIds);
      for (let i = 0; i < trimmedCount; i += 1) {
        trimmedAllowedSet.add(allowedOptionalIds[i]);
      }
      if (trimmedAllowedSet.size > 0) {
        const fallbackParams = {
          ...params,
          allowedIngredientIds: Array.from(trimmedAllowedSet),
          maxStateVisits,
          allowOptionalTrim: false,
        };
        const fallbackResult = solveRecipe(fallbackParams);
        const trimMessage = translate('solver_trimmed_optional', {
          kept: trimmedCount,
          total: allowedOptionalIds.length,
        });
        const combinedInfo = [];
        if (typeof trimMessage === 'string' && trimMessage.length) {
          combinedInfo.push(trimMessage);
        }
        const fallbackInfo = Array.isArray(fallbackResult.info)
          ? fallbackResult.info
          : [];
        fallbackInfo.forEach((msg) => {
          if (typeof msg === 'string' && msg.length && !combinedInfo.includes(msg)) {
            combinedInfo.push(msg);
          }
        });
        const fallbackSolutions = Array.isArray(fallbackResult.solutions)
          ? fallbackResult.solutions
          : [];
        const fallbackTotal = Number.isFinite(fallbackResult.totalSolutions)
          ? fallbackResult.totalSolutions
          : fallbackSolutions.length;
        return {
          solutions: fallbackSolutions,
          info: combinedInfo,
          totalSolutions: fallbackTotal,
        };
      }
    }
  }

  return { solutions, info: infoMessages, totalSolutions };
};
