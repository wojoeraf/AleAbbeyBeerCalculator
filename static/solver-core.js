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
    topK = 10,
    attrs,
    styles,
    ingredients,
    translate,
    displayStyleName,
  } = params;

  const style = styles[styleName];
  if (!style) {
    return {
      solutions: [],
      info: [translate('unknown_style', { style: displayStyleName(styleName) })],
    };
  }

  const n = ingredients.length;
  const base = (style.base || new Array(attrs.length).fill(0)).map(Number);
  const vectors = ingredients.map((ing) => (ing.vec || new Array(attrs.length).fill(0)).map(Number));
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
    return { solutions: [], info: [translate('min_exceeds_cap')] };
  }

  const minSum = minCounts.reduce((acc, val) => acc + val, 0);
  const adjustedTotalCap = Math.max(totalCap, minSum);
  const remainingCap = Math.max(0, adjustedTotalCap - minSum);
  const allowedSet = allowedIngredientIds instanceof Set
    ? allowedIngredientIds
    : Array.isArray(allowedIngredientIds)
      ? new Set(allowedIngredientIds)
      : null;

  const perIngredientCeilValues = new Array(n).fill(0);
  for (let idx = 0; idx < n; idx += 1) {
    const id = getIngredientId(ingredients[idx], idx);
    const required = minCounts[idx] > 0;
    const optionalAllowed = !allowedSet || allowedSet.has(id);
    const isAllowed = required || optionalAllowed;
    perIngredientCeilValues[idx] = isAllowed ? Math.min(perCap, adjustedTotalCap) : minCounts[idx];
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
    return { solutions: [], info: [translate('no_intervals')] };
  }

  const weightedOrder = Array.from({ length: n }, (_, idx) => {
    const vec = vectors[idx];
    let weight = 0;
    for (let k = 0; k < attrs.length; k += 1) {
      const val = Math.abs(vec[k] || 0);
      if (val > weight) {
        weight = val;
      }
    }
    return { idx, weight };
  });
  weightedOrder.sort((a, b) => b.weight - a.weight);
  const orderedIndices = weightedOrder.map((entry) => entry.idx);
  const orderedVectors = orderedIndices.map((idx) => vectors[idx]);
  const orderedMinCounts = orderedIndices.map((idx) => minCounts[idx]);
  const orderedMaxCounts = orderedIndices.map((idx) => perIngredientCeilValues[idx]);

  const suffixMinCounts = new Array(n + 1).fill(0);
  for (let idx = n - 1; idx >= 0; idx -= 1) {
    suffixMinCounts[idx] = orderedMinCounts[idx] + suffixMinCounts[idx + 1];
  }
  if (suffixMinCounts[0] > adjustedTotalCap) {
    return { solutions: [], info: [translate('cap_too_small')] };
  }

  const suffixLo = Array.from({ length: n + 1 }, () => new Array(attrs.length).fill(0));
  const suffixHi = Array.from({ length: n + 1 }, () => new Array(attrs.length).fill(0));
  for (let idx = n - 1; idx >= 0; idx -= 1) {
    const vec = orderedVectors[idx];
    const loCnt = orderedMinCounts[idx];
    const hiCnt = orderedMaxCounts[idx];
    for (let k = 0; k < attrs.length; k += 1) {
      const coef = vec[k] || 0;
      const loVal = coef >= 0 ? coef * loCnt : coef * hiCnt;
      const hiVal = coef >= 0 ? coef * hiCnt : coef * loCnt;
      suffixLo[idx][k] = loVal + suffixLo[idx + 1][k];
      suffixHi[idx][k] = hiVal + suffixHi[idx + 1][k];
    }
  }

  const counts = new Array(n).fill(0);
  const seenCombos = new Set();
  const solutions = [];
  let bestSumBound = Infinity;

  const compareSolutions = (a, b) => {
    if (a.sum !== b.sum) return a.sum - b.sum;
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
    if (solutions.length >= topK) {
      bestSumBound = solutions[solutions.length - 1].sum;
    } else {
      bestSumBound = Infinity;
    }
  };

  const iterateBoxes = (attrIdx, lower, upper) => {
    if (attrIdx === attrs.length) {
      const lowerBounds = lower.slice();
      const upperBounds = upper.slice();

      const dfs = (idx, used, totals) => {
        if (idx >= n) {
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

          const bands = {};
          for (let k = 0; k < attrs.length; k += 1) {
            const attr = attrs[k];
            bands[attr] = detectBand(style, attr, totals[k]) || 'n/a';
          }

          const totalsRounded = totals.map((val) => Math.round(val * 1000) / 1000);
          const ingredientCount = Object.keys(countsById).length;
          insertSolution({
            x: countsOriginal,
            sum: countsOriginal.reduce((acc, val) => acc + val, 0),
            totals: totalsRounded,
            bands,
            countsById,
            ingredientCount,
          });
          return;
        }

        if (bestSumBound !== Infinity && used + suffixMinCounts[idx] > bestSumBound) {
          return;
        }

        if (used + suffixMinCounts[idx] > adjustedTotalCap) {
          return;
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
        for (let c = minC; c <= maxC; c += 1) {
          if (bestSumBound !== Infinity && used + c + suffixMinCounts[idx + 1] > bestSumBound) {
            continue;
          }
          counts[idx] = c;
          const newTotals = totals.map((val, k) => val + (vec[k] || 0) * c);
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
            dfs(idx + 1, used + c, newTotals);
          }
        }
        counts[idx] = 0;
      };

      dfs(0, 0, base.slice());
      return;
    }

    for (const interval of perAttrLists[attrIdx]) {
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

  solutions.sort(compareSolutions);

  return { solutions, info: [] };
};
