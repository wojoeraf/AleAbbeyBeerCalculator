const parseJSONScript = (id, fallback) => {
  const el = document.getElementById(id);
  if (!el) return fallback;
  try {
    const txt = el.textContent || el.innerText || '';
    return txt ? JSON.parse(txt) : fallback;
  } catch (error) {
    console.error(`Failed to parse ${id}`, error);
    return fallback;
  }
};

const formatTemplate = (template, replacements = {}) => {
  if (typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      const value = replacements[key];
      if (value === null || value === undefined) {
        return '';
      }
      return String(value);
    }
    return match;
  });
};

const initSolver = () => {
  const i18nData = parseJSONScript('i18n-data', {});
  const styleMinMap = parseJSONScript('style-min-data', {});
  const rawIngredientData = parseJSONScript('ingredients-data', []);
  const ingredientCategories = Array.isArray(rawIngredientData.categories)
    ? rawIngredientData.categories
    : Array.isArray(rawIngredientData)
      ? [{ id: 'uncategorized', names: {}, ingredients: rawIngredientData }]
      : [];
  const ingredients = ingredientCategories.flatMap((category) => {
    const items = Array.isArray(category.ingredients) ? category.ingredients : [];
    return items.map((item) => ({
      ...item,
      category_id: category.id || '',
      category_names: category.names || {},
    }));
  });
  const stylesData = parseJSONScript('styles-data', {});
  const metaData = parseJSONScript('meta-data', {});

  const ATTRS = metaData.attrs || ['taste', 'color', 'strength', 'foam'];
  const attrLabels = metaData.attr_labels || metaData.attrLabels || {};
  const bandLabels = metaData.band_labels || metaData.bandLabels || {};
  const EPS = 1e-9;

  const messages = i18nData.messages || {};
  const uiStrings = i18nData.ui || {};
  const ingredientNames = i18nData.ingredient_names || {};
  const styleNameMap = i18nData.style_names || {};
  const currentLang = i18nData.lang || 'en';

  const translate = (key, replacements = {}) => {
    if (typeof messages[key] === 'string') {
      return formatTemplate(messages[key], replacements);
    }
    if (typeof uiStrings[key] === 'string') {
      return formatTemplate(uiStrings[key], replacements);
    }
    return key;
  };

  const getIngredientId = (ingredient, index) => {
    if (ingredient && typeof ingredient.id === 'string') {
      return ingredient.id;
    }
    if (ingredient && typeof ingredient.name === 'string') {
      return ingredient.name;
    }
    return String(index);
  };

  const displayIngredientName = (id) => {
    if (!id) {
      return translate('style_unknown');
    }
    if (ingredientNames[id]) {
      return ingredientNames[id];
    }
    const entry = ingredients.find((ing, idx) => getIngredientId(ing, idx) === id);
    if (entry) {
      if (entry.names) {
        if (currentLang && entry.names[currentLang]) {
          return entry.names[currentLang];
        }
        if (entry.names.en) {
          return entry.names.en;
        }
        if (entry.names.de) {
          return entry.names.de;
        }
        const values = Object.values(entry.names);
        if (values.length) {
          return values[0];
        }
      }
      if (entry.name) {
        return entry.name;
      }
    }
    return id;
  };

  const displayStyleName = (id) => {
    if (!id) {
      return translate('style_unknown');
    }
    return styleNameMap[id] || id;
  };

  const attrCards = Array.from(document.querySelectorAll('[data-attr-card]'));
  const submitBtn = document.querySelector('[data-submit-button]');
  const setAllGreenBtn = document.querySelector('[data-set-all-green]');
  const styleSelect = document.querySelector('select[name="style"]');
  const ingredientRows = Array.from(document.querySelectorAll('[data-ingredient-row]'));
  const form = document.querySelector('[data-solver-form]');
  const ingredientsWrapper = document.querySelector('[data-ingredients-wrapper]');
  const categoryBodies = new Map(
    Array.from(document.querySelectorAll('[data-ingredient-category]')).map((el) => [
      el.dataset.categoryId,
      el,
    ]),
  );
  const categoryHeaders = new Map(
    Array.from(document.querySelectorAll('[data-category-header]')).map((el) => [
      el.dataset.categoryId,
      el,
    ]),
  );
  const categoryToggles = new Map(
    Array.from(document.querySelectorAll('[data-category-toggle]')).map((toggle) => [
      toggle.dataset.categoryId,
      toggle,
    ]),
  );
  const mobileAttrToggle = document.querySelector('[data-attribute-toggle]');
  const mobileAttrToggleInput = document.querySelector('[data-attribute-toggle-input]');
  const stackedLayoutQuery = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(max-width: 640px)')
    : null;

  const resultsSection = document.querySelector('[data-results]');
  const resultsTitle = document.querySelector('[data-results-title]');
  const resultsSummary = document.querySelector('[data-results-summary]');
  const resultsList = document.querySelector('[data-results-list]');
  const resultsEmpty = document.querySelector('[data-results-empty]');
  const statusMessage = document.querySelector('[data-status-message]');
  const resultsControls = document.querySelector('[data-results-controls]');
  const sortAttrSelect = document.querySelector('[data-sort-attr]');
  const sortOrderSelect = document.querySelector('[data-sort-order]');
  const debugPanel = document.querySelector('[data-debug-panel]');
  const debugOutput = document.querySelector('[data-debug-output]');
  const debugToggle = document.getElementById('debug-toggle');
  const debugContent = document.querySelector('[data-debug-content]');

  let latestSolutions = [];
  let latestSummaryLines = [];
  let latestInfoMessages = [];
  let hasRenderedResults = false;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const syncAttributeToggleVisibility = () => {
    if (!ingredientsWrapper) return;
    const isStacked = stackedLayoutQuery ? stackedLayoutQuery.matches : false;

    if (mobileAttrToggle) {
      mobileAttrToggle.hidden = !isStacked;
    }

    if (!isStacked) {
      ingredientsWrapper.dataset.hideAttributes = 'false';
      if (mobileAttrToggleInput) {
        mobileAttrToggleInput.checked = false;
      }
      return;
    }

    const showAttributes = mobileAttrToggleInput ? mobileAttrToggleInput.checked : false;
    ingredientsWrapper.dataset.hideAttributes = showAttributes ? 'false' : 'true';
  };

  if (mobileAttrToggleInput) {
    mobileAttrToggleInput.addEventListener('change', syncAttributeToggleVisibility);
  }

  if (stackedLayoutQuery) {
    if (typeof stackedLayoutQuery.addEventListener === 'function') {
      stackedLayoutQuery.addEventListener('change', syncAttributeToggleVisibility);
    } else if (typeof stackedLayoutQuery.addListener === 'function') {
      stackedLayoutQuery.addListener(syncAttributeToggleVisibility);
    }
  }

  syncAttributeToggleVisibility();

  const setCategoryExpanded = (categoryId, expanded) => {
    const value = expanded ? 'true' : 'false';
    const toggle = categoryToggles.get(categoryId);
    const header = categoryHeaders.get(categoryId);
    const body = categoryBodies.get(categoryId);
    if (toggle) {
      toggle.setAttribute('aria-expanded', value);
    }
    if (header) {
      header.dataset.expanded = value;
    }
    if (body) {
      body.hidden = !expanded;
    }
  };

  categoryToggles.forEach((toggle, categoryId) => {
    const initialExpanded = toggle.getAttribute('aria-expanded') !== 'false';
    setCategoryExpanded(categoryId, initialExpanded);
    toggle.addEventListener('click', () => {
      const nextExpanded = toggle.getAttribute('aria-expanded') === 'false';
      setCategoryExpanded(categoryId, nextExpanded);
    });
  });

  let parallaxTicking = false;
  const updateParallax = () => {
    if (!document.body) return;
    const offset = Math.round(window.scrollY * -0.25);
    document.body.style.setProperty('--bg-parallax-offset', `${offset}px`);
    parallaxTicking = false;
  };

  const handleScroll = () => {
    if (parallaxTicking) return;
    parallaxTicking = true;
    window.requestAnimationFrame(updateParallax);
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  updateParallax();

  const syncDebugVisibility = () => {
    if (!debugContent) return;
    if (debugToggle && !debugToggle.checked) {
      debugContent.hidden = true;
    } else {
      debugContent.hidden = false;
    }
  };

  if (debugToggle) {
    debugToggle.addEventListener('change', syncDebugVisibility);
    syncDebugVisibility();
  }

  const detectBand = (style, attr, value) => {
    const segments = (style.bands && style.bands[attr]) || [];
    for (const seg of segments) {
      const min = seg.min ?? 0;
      const max = seg.max ?? 0;
      if (value >= min - EPS && value <= max + EPS) {
        return seg.band;
      }
    }
    return null;
  };

  const intersectInterval = (a, b) => {
    const lo = Math.max(a[0], b[0]);
    const hi = Math.min(a[1], b[1]);
    return lo <= hi ? [lo, hi] : null;
  };

  const styleIds = Object.keys(stylesData);

  const solveRecipe = ({
    styleName,
    numericIntervals,
    bandPreferences,
    totalCap,
    perCap,
    extraMinCounts,
    topK = 10,
  }) => {
    const style = stylesData[styleName];
    if (!style) {
      return { solutions: [], info: [translate('unknown_style', { style: displayStyleName(styleName) })] };
    }

    const n = ingredients.length;
    const base = (style.base || [0, 0, 0, 0]).map(Number);
    const vectors = ingredients.map((ing) => (ing.vec || [0, 0, 0, 0]).map(Number));
    const idToIndex = new Map(ingredients.map((ing, idx) => [getIngredientId(ing, idx), idx]));

    const minCounts = new Array(n).fill(0);
    const mandatory = style.min_counts || {};
    Object.entries(mandatory).forEach(([id, cnt]) => {
      if (!idToIndex.has(id)) return;
      const idx = idToIndex.get(id);
      minCounts[idx] = Math.max(minCounts[idx], Number(cnt) || 0);
    });

    if (extraMinCounts) {
      Object.entries(extraMinCounts).forEach(([id, cnt]) => {
        if (!idToIndex.has(id)) return;
        const idx = idToIndex.get(id);
        minCounts[idx] = Math.max(minCounts[idx], Number(cnt) || 0);
      });
    }

    if (minCounts.some((cnt) => cnt > perCap)) {
      return { solutions: [], info: [translate('min_exceeds_cap')] };
    }

    const minSum = minCounts.reduce((acc, val) => acc + val, 0);
    const adjustedTotalCap = Math.max(totalCap, minSum);
    const remainingCap = Math.max(0, adjustedTotalCap - minSum);
    const perIngredientCeil = Math.min(perCap, adjustedTotalCap);
    const baseTotals = ATTRS.map((_, idx) => Number(base[idx]) || 0);
    const totalsAfterMin = baseTotals.slice();
    const attrExtraCapacity = ATTRS.map(() => ({ positives: [], negatives: [] }));

    for (let idx = 0; idx < n; idx += 1) {
      const vec = vectors[idx];
      const minCnt = minCounts[idx];
      for (let k = 0; k < ATTRS.length; k += 1) {
        const coef = vec[k] || 0;
        if (coef !== 0) {
          totalsAfterMin[k] += coef * minCnt;
        }
      }
      const available = Math.max(0, perIngredientCeil - minCnt);
      if (available > 0) {
        for (let k = 0; k < ATTRS.length; k += 1) {
          const coef = vec[k] || 0;
          if (coef > 0) {
            attrExtraCapacity[k].positives.push({ coef, available });
          } else if (coef < 0) {
            attrExtraCapacity[k].negatives.push({ coef, available });
          }
        }
      }
    }

    const perAttrIntervals = ATTRS.map((attr) => numericIntervals[attr]);
    const defaultAttrBounds = ATTRS.map((_, attrIdx) => {
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
    ATTRS.forEach((attr) => {
      const pref = bandPreferences[attr];
      allowedBandMap[attr] = pref ? [...pref] : null;
    });

    const allowedIntervalsForAttr = (attr, allowedBands) => {
      const attrIndex = ATTRS.indexOf(attr);
      let startInterval =
        perAttrIntervals[attrIndex] || [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
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

    const perAttrLists = ATTRS.map((attr) => allowedIntervalsForAttr(attr, allowedBandMap[attr]));
    if (perAttrLists.some((list) => list.length === 0)) {
      return { solutions: [], info: [translate('no_intervals')] };
    }

    const weightedOrder = Array.from({ length: n }, (_, idx) => {
      const vec = vectors[idx];
      let weight = 0;
      for (let k = 0; k < ATTRS.length; k += 1) {
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

    const suffixMinCounts = new Array(n + 1).fill(0);
    for (let idx = n - 1; idx >= 0; idx -= 1) {
      suffixMinCounts[idx] = orderedMinCounts[idx] + suffixMinCounts[idx + 1];
    }
    if (suffixMinCounts[0] > adjustedTotalCap) {
      return { solutions: [], info: [translate('cap_too_small')] };
    }

    const suffixLo = Array.from({ length: n + 1 }, () => new Array(ATTRS.length).fill(0));
    const suffixHi = Array.from({ length: n + 1 }, () => new Array(ATTRS.length).fill(0));
    for (let idx = n - 1; idx >= 0; idx -= 1) {
      const vec = orderedVectors[idx];
      const loCnt = orderedMinCounts[idx];
      const hiCnt = perCap;
      for (let k = 0; k < ATTRS.length; k += 1) {
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
      for (let k = 0; k < ATTRS.length; k += 1) {
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
      if (attrIdx === ATTRS.length) {
        const lowerBounds = lower.slice();
        const upperBounds = upper.slice();

        const dfs = (idx, used, totals) => {
          if (idx >= n) {
            for (let k = 0; k < ATTRS.length; k += 1) {
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
            for (let k = 0; k < ATTRS.length; k += 1) {
              const attr = ATTRS[k];
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

          for (let k = 0; k < ATTRS.length; k += 1) {
            const minPossible = totals[k] + suffixLo[idx][k];
            const maxPossible = totals[k] + suffixHi[idx][k];
            if (maxPossible < lowerBounds[k] - EPS || minPossible > upperBounds[k] + EPS) {
              return;
            }
          }

          const remainingMinAfter = suffixMinCounts[idx + 1];
          const maxC = Math.min(perCap, adjustedTotalCap - used - remainingMinAfter);
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
            for (let k = 0; k < ATTRS.length; k += 1) {
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
      new Array(ATTRS.length).fill(Number.NEGATIVE_INFINITY),
      new Array(ATTRS.length).fill(Number.POSITIVE_INFINITY),
    );

    solutions.sort(compareSolutions);

    return { solutions, info: [] };
  };

  const sliderStepToNumber = (raw) => {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return clamp(numeric, 0, 110) / 10;
  };

  const formatSliderValue = (value) => {
    if (!Number.isFinite(value)) {
      return '0.0';
    }
    return value.toFixed(1);
  };

  const updateSliderProgress = (slider) => {
    if (!slider) return;
    const max = Number(slider.max) || 1;
    const value = clamp(Number(slider.value), 0, max);
    const percent = (value / max) * 100;
    slider.style.setProperty('--slider-progress', `${percent}%`);
  };

  const colorStateUpdaters = [];

  const updateSubmitState = () => {
    if (!submitBtn) return;
    const hasConstraint = attrCards.some((card) => {
      const selectedBand = card.querySelector('input[type="radio"][data-color-radio]:checked');
      const modeInput = card.querySelector('[data-mode-input]');
      const bandActive = !!selectedBand;
      const modeActive = modeInput && modeInput.value !== 'any';
      return bandActive || modeActive;
    });
    submitBtn.disabled = !hasConstraint;
  };

  attrCards.forEach((card) => {
    const slider = card.querySelector('[data-attr-range]');
    const sliderValueEl = card.querySelector('[data-slider-value]');
    const modeButtons = Array.from(card.querySelectorAll('[data-mode-btn]'));
    const modeInput = card.querySelector('[data-mode-input]');
    const minInput = card.querySelector('[data-min-input]');
    const maxInput = card.querySelector('[data-max-input]');
    const attrControls = card.querySelector('[data-slider-area]');
    const colorRadios = Array.from(card.querySelectorAll('input[type="radio"][data-color-radio]'));
    const clearBtn = card.querySelector('[data-clear-color]');
    const sliderInitialValue = slider
      ? Number(slider.dataset.initialValue || sliderStepToNumber(slider.value))
      : null;
    let activeColorRadio = colorRadios.find((radio) => radio.checked) || null;

    if (!modeInput || !minInput || !maxInput) {
      colorRadios.forEach((radio) => {
        radio.addEventListener('change', updateSubmitState);
      });
      return;
    }

    const sanitizeMode = (mode) => {
      if (mode === 'ge' || mode === 'le' || mode === 'eq') {
        return mode;
      }
      return 'eq';
    };

    const syncSliderDisplay = () => {
      if (!slider) return;
      const numeric = sliderStepToNumber(slider.value);
      if (sliderValueEl) {
        sliderValueEl.textContent = formatSliderValue(numeric);
      }
      slider.setAttribute('aria-valuenow', formatSliderValue(numeric));
      updateSliderProgress(slider);
    };

    const syncHiddenValues = () => {
      if (!slider) return;
      const formatted = formatSliderValue(sliderStepToNumber(slider.value));
      const mode = modeInput.value;
      if (mode === 'ge') {
        minInput.value = formatted;
        maxInput.value = '';
      } else if (mode === 'le') {
        minInput.value = '';
        maxInput.value = formatted;
      } else if (mode === 'eq') {
        minInput.value = formatted;
        maxInput.value = formatted;
      } else {
        minInput.value = '';
        maxInput.value = '';
      }
    };

    const setModeButtonsState = () => {
      modeButtons.forEach((btn) => {
        const isDisabled = slider ? slider.disabled : false;
        const isActive = !isDisabled && btn.dataset.mode === modeInput.value;
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    };

    const fallbackMode = 'eq';
    let storedMode = modeInput.value === 'any' ? null : sanitizeMode(modeInput.value);

    const setSliderDisabled = (disabled) => {
      if (slider) {
        slider.disabled = !!disabled;
        if (!disabled) {
          syncSliderDisplay();
        }
      }
      if (attrControls) {
        attrControls.classList.toggle('is-disabled', !!disabled);
      }
      modeButtons.forEach((btn) => {
        btn.disabled = !!disabled;
      });
      setModeButtonsState();
    };

    const syncClearButtonState = () => {
      if (!clearBtn) return;
      const hasColorSelection = colorRadios.some((radio) => radio.checked);
      const hasModeSelection = modeInput.value !== 'any';
      clearBtn.disabled = !(hasColorSelection || hasModeSelection);
    };

    const applyMode = (mode) => {
      if (mode === 'any') {
        storedMode = null;
        modeInput.value = 'any';
        delete card.dataset.savedMode;
        setSliderDisabled(slider ? slider.disabled : false);
        minInput.value = '';
        maxInput.value = '';
        updateSubmitState();
        syncClearButtonState();
        return;
      }

      const normalized = sanitizeMode(mode);
      storedMode = normalized;
      modeInput.value = normalized;
      delete card.dataset.savedMode;
      setSliderDisabled(slider ? slider.disabled : false);
      syncHiddenValues();
      updateSubmitState();
      syncClearButtonState();
    };

    const updateColorState = () => {
      const selected = colorRadios.find((radio) => radio.checked) || null;
      activeColorRadio = selected;
      const isColorActive = !!selected;
      if (isColorActive) {
        if (modeInput.value !== 'any') {
          const preserved = sanitizeMode(modeInput.value);
          storedMode = preserved;
          card.dataset.savedMode = preserved;
        } else if (storedMode) {
          card.dataset.savedMode = storedMode;
        } else {
          delete card.dataset.savedMode;
        }
        modeInput.value = 'any';
        setSliderDisabled(true);
        minInput.value = '';
        maxInput.value = '';
      } else {
        setSliderDisabled(false);
        const saved = card.dataset.savedMode;
        if (saved) {
          const restored = sanitizeMode(saved);
          storedMode = restored;
          modeInput.value = restored;
        } else if (storedMode) {
          modeInput.value = storedMode;
        } else {
          modeInput.value = 'any';
          minInput.value = '';
          maxInput.value = '';
        }
        if (!storedMode) {
          delete card.dataset.savedMode;
        }
        syncHiddenValues();
      }
      updateSubmitState();
      syncClearButtonState();
    };

    const clearAttributeConstraints = () => {
      colorRadios.forEach((radio) => {
        radio.checked = false;
      });
      storedMode = null;
      delete card.dataset.savedMode;
      modeInput.value = 'any';
      if (slider) {
        const baseValue = Number.isFinite(sliderInitialValue)
          ? clamp(sliderInitialValue, 0, 11)
          : sliderStepToNumber(slider.value);
        slider.value = String(Math.round(baseValue * 10));
      }
      updateColorState();
    };

    colorRadios.forEach((radio) => {
      radio.addEventListener('click', (event) => {
        if (activeColorRadio === radio) {
          event.preventDefault();
          radio.checked = false;
          activeColorRadio = null;
          updateColorState();
        }
      });
      radio.addEventListener('change', () => {
        if (radio.checked) {
          activeColorRadio = radio;
        } else if (activeColorRadio === radio) {
          activeColorRadio = null;
        }
        updateColorState();
      });
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearAttributeConstraints();
      });
    }

    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (slider && slider.disabled) {
          return;
        }

        const targetMode = btn.dataset.mode || 'eq';
        const isActive = modeInput.value === targetMode;
        applyMode(isActive ? 'any' : targetMode);
        setModeButtonsState();
      });
    });

    if (slider) {
      slider.addEventListener('input', () => {
        syncSliderDisplay();
        if (modeInput.value === 'any') {
          applyMode(storedMode || fallbackMode);
        } else {
          syncHiddenValues();
          updateSubmitState();
        }
        syncClearButtonState();
      });
      slider.addEventListener('change', () => {
        syncSliderDisplay();
        syncHiddenValues();
        syncClearButtonState();
      });
      syncSliderDisplay();
    }

    syncHiddenValues();
    setModeButtonsState();
    updateColorState();
    colorStateUpdaters.push(updateColorState);
  });

  if (setAllGreenBtn) {
    const labelSpan = setAllGreenBtn.querySelector('[data-set-all-green-label]');
    const initialLabel = labelSpan ? labelSpan.textContent : '';
    const greenLabel = setAllGreenBtn.dataset.labelGreen || initialLabel;
    const anyLabel = setAllGreenBtn.dataset.labelAny || initialLabel;

    const setButtonMode = (mode) => {
      setAllGreenBtn.dataset.mode = mode;
      if (!labelSpan) return;
      labelSpan.textContent = mode === 'green' ? greenLabel : anyLabel;
    };

    setButtonMode('green');

    setAllGreenBtn.addEventListener('click', () => {
      const mode = setAllGreenBtn.dataset.mode === 'any' ? 'any' : 'green';

      attrCards.forEach((card) => {
        if (mode === 'green') {
          const targetRadio = card.querySelector('input[type="radio"][data-color-radio][value="green"]');
          if (targetRadio) {
            targetRadio.checked = true;
          }
        } else {
          const radios = card.querySelectorAll('input[type="radio"][data-color-radio]');
          radios.forEach((radio) => {
            radio.checked = false;
          });
        }
      });

      colorStateUpdaters.forEach((fn) => fn());
      updateSubmitState();

      setButtonMode(mode === 'green' ? 'any' : 'green');
    });
  }

  ingredientRows.forEach((row) => {
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    checkbox.addEventListener('change', () => {
      checkbox.dataset.userSelected = checkbox.checked ? 'true' : 'false';
    });
  });

  const requiredTooltip = uiStrings.tooltip_required || '';
  const requiredSingle = uiStrings.badge_required_single || 'Required';
  const requiredMultipleTemplate = uiStrings.badge_required_multiple || `${requiredSingle} × {count}`;
  const formatRequiredBadge = (count) => {
    if (count > 1) {
      return formatTemplate(requiredMultipleTemplate, { count });
    }
    return requiredSingle;
  };

  const applyStyleRequirements = (styleName) => {
    if (!styleName) return;
    const activeMins = styleMinMap[styleName] || {};

    ingredientRows.forEach((row) => {
      const ingredientId = row.dataset.ingredientId;
      const checkbox = row.querySelector('input[type="checkbox"]');
      const label = row.querySelector('.ingredient-option');
      const badge = row.querySelector('[data-required-badge]');
      if (!checkbox || !ingredientId) {
        return;
      }
      const requiredCount = activeMins[ingredientId] || 0;
      if (requiredCount > 0) {
        row.classList.add('ingredient-locked');
        checkbox.checked = true;
        checkbox.disabled = true;
        checkbox.dataset.userSelected = 'false';
        if (label && requiredTooltip) {
          label.title = requiredTooltip;
        }
        if (badge) {
          badge.hidden = false;
          badge.textContent = formatRequiredBadge(requiredCount);
        }
      } else {
        row.classList.remove('ingredient-locked');
        checkbox.disabled = false;
        const userSelected = checkbox.dataset.userSelected === 'true';
        checkbox.checked = userSelected;
        if (label) {
          label.removeAttribute('title');
        }
        if (badge) {
          badge.hidden = true;
          badge.textContent = requiredSingle;
        }
      }
    });
  };

  if (styleSelect) {
    styleSelect.addEventListener('change', () => {
      applyStyleRequirements(styleSelect.value);
    });
    applyStyleRequirements(styleSelect.value);
  }

  updateSubmitState();

  const parseFloatOrNull = (value) => {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const formatIntervalValue = (value) => {
    if (!Number.isFinite(value)) {
      return value < 0 ? '-∞' : '∞';
    }
    return value.toFixed(2);
  };

  const formatResultValue = (value) => {
    if (!Number.isFinite(value)) {
      return '0';
    }
    const rounded = Math.round(value * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-6) {
      return String(Math.round(rounded));
    }
    return rounded.toFixed(1);
  };

  const sanitizeBand = (band) => {
    const safe = String(band || 'n/a')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return safe || 'n-a';
  };

  const numericValue = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const getSelectedSortAttr = () => {
    if (sortAttrSelect && ATTRS.includes(sortAttrSelect.value)) {
      return sortAttrSelect.value;
    }
    return ATTRS.length ? ATTRS[0] : null;
  };

  const getSelectedSortOrder = () => {
    if (sortOrderSelect && sortOrderSelect.value === 'asc') {
      return 'asc';
    }
    return 'desc';
  };

  const sortSolutionsForDisplay = (solutions) => {
    if (!Array.isArray(solutions)) return [];
    const attr = getSelectedSortAttr();
    const attrIndexRaw = attr ? ATTRS.indexOf(attr) : -1;
    const attrIndex = attrIndexRaw >= 0 ? attrIndexRaw : 0;
    const order = getSelectedSortOrder();

    const sorted = [...solutions];
    sorted.sort((a, b) => {
      const totalsA = Array.isArray(a.totals) ? a.totals : [];
      const totalsB = Array.isArray(b.totals) ? b.totals : [];
      const aVal = numericValue(totalsA[attrIndex]);
      const bVal = numericValue(totalsB[attrIndex]);
      const primaryDiff = aVal - bVal;
      if (Math.abs(primaryDiff) > EPS) {
        return order === 'asc' ? primaryDiff : -primaryDiff;
      }

      const countA = Number.isFinite(a.ingredientCount)
        ? a.ingredientCount
        : Object.keys(a.countsById || {}).length;
      const countB = Number.isFinite(b.ingredientCount)
        ? b.ingredientCount
        : Object.keys(b.countsById || {}).length;
      if (countA !== countB) {
        return countA - countB;
      }

      if (a.sum !== b.sum) {
        return a.sum - b.sum;
      }

      for (let idx = 0; idx < ATTRS.length; idx += 1) {
        if (idx === attrIndex) continue;
        const diff = numericValue(totalsA[idx]) - numericValue(totalsB[idx]);
        if (Math.abs(diff) > EPS) {
          return diff;
        }
      }

      const keyA = Array.isArray(a.x) ? a.x.join('|') : '';
      const keyB = Array.isArray(b.x) ? b.x.join('|') : '';
      if (keyA || keyB) {
        return keyA.localeCompare(keyB);
      }
      return 0;
    });
    return sorted;
  };

  const applyResultsState = () => {
    if (!resultsSection || !hasRenderedResults) return;
    const summaryLines = Array.isArray(latestSummaryLines) ? latestSummaryLines : [];
    const infoMessages = Array.isArray(latestInfoMessages) ? latestInfoMessages : [];
    const sortedSolutions = sortSolutionsForDisplay(latestSolutions);
    const count = sortedSolutions.length;

    resultsSection.hidden = false;

    if (resultsTitle) {
      const titleText = translate('results_title', { count });
      resultsTitle.textContent = typeof titleText === 'string' ? titleText : translate('results_heading');
    }

    if (resultsSummary) {
      if (summaryLines.length) {
        resultsSummary.hidden = false;
        resultsSummary.textContent = summaryLines.join(' • ');
      } else {
        resultsSummary.hidden = true;
        resultsSummary.textContent = '';
      }
    }

    if (statusMessage) {
      if (infoMessages.length > 0) {
        statusMessage.hidden = false;
        statusMessage.textContent = infoMessages.join(' ');
      } else {
        statusMessage.hidden = true;
        statusMessage.textContent = '';
      }
    }

    if (resultsEmpty) {
      resultsEmpty.hidden = count !== 0;
    }

    if (resultsControls) {
      resultsControls.hidden = count === 0;
    }

    if (resultsList) {
      resultsList.innerHTML = '';
    }

    if (count === 0) {
      return;
    }

    sortedSolutions.forEach((solution, index) => {
      const card = document.createElement('article');
      card.className = 'card result-card';

      const header = document.createElement('div');
      header.className = 'result-card-header';

      const titleRow = document.createElement('div');
      titleRow.className = 'result-card-title-row';

      const heading = document.createElement('h3');
      heading.textContent = translate('solutions_total', { count: solution.sum });
      titleRow.appendChild(heading);

      const bandContainer = document.createElement('div');
      bandContainer.className = 'result-band-pills result-band-pills--inline';
      titleRow.appendChild(bandContainer);

      header.appendChild(titleRow);

      const rank = document.createElement('span');
      rank.className = 'result-card-rank';
      rank.textContent = `#${index + 1}`;
      header.appendChild(rank);

      card.appendChild(header);

      const mixSection = document.createElement('div');
      mixSection.className = 'result-ingredients';

      const mixTitle = document.createElement('p');
      mixTitle.className = 'result-section-title';
      mixTitle.textContent = translate('results_mix_title');
      mixSection.appendChild(mixTitle);

      const chipsContainer = document.createElement('div');
      chipsContainer.className = 'chips';
      Object.entries(solution.countsById).forEach(([id, cnt]) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        const label = `${displayIngredientName(id)} × ${cnt}`;
        chip.title = label;
        const span = document.createElement('span');
        span.textContent = label;
        chip.appendChild(span);
        chipsContainer.appendChild(chip);
      });
      mixSection.appendChild(chipsContainer);

      card.appendChild(mixSection);

      const attrTitle = document.createElement('p');
      attrTitle.className = 'result-section-title';
      attrTitle.textContent = translate('section_attributes');
      card.appendChild(attrTitle);

      const chart = document.createElement('div');
      chart.className = 'result-attr-chart';

      const scaleMax = Math.max(
        12,
        ...solution.totals.map((value) => (Number.isFinite(value) ? value : 0)),
      );

      ATTRS.forEach((attr, idx) => {
        const value = Number(solution.totals[idx]) || 0;
        const band = solution.bands[attr];
        const sanitized = sanitizeBand(band);

        const bar = document.createElement('div');
        bar.className = 'result-attr-bar';
        bar.setAttribute('role', 'group');
        bar.setAttribute(
          'aria-label',
          `${attrLabels[attr] || attr}: ${formatResultValue(value)} (${bandLabels[band] || band || 'n/a'})`,
        );

        const valueLabel = document.createElement('span');
        valueLabel.className = 'result-attr-value';
        valueLabel.textContent = formatResultValue(value);
        bar.appendChild(valueLabel);

        const track = document.createElement('div');
        track.className = 'result-attr-track';

        const fill = document.createElement('div');
        fill.className = 'result-attr-fill';
        fill.dataset.band = sanitized;
        const percent = scaleMax > 0 ? clamp((value / scaleMax) * 100, 0, 100) : 0;
        fill.style.height = `${percent}%`;
        fill.title = `${attrLabels[attr] || attr}: ${formatResultValue(value)}`;
        track.appendChild(fill);
        bar.appendChild(track);

        const nameLabel = document.createElement('span');
        nameLabel.className = 'result-attr-name';
        nameLabel.textContent = attrLabels[attr] || attr;
        bar.appendChild(nameLabel);

        chart.appendChild(bar);
      });

      card.appendChild(chart);

      ATTRS.forEach((attr) => {
        const band = solution.bands[attr];
        const sanitized = sanitizeBand(band);
        const pill = document.createElement('span');
        pill.className = `pill ${sanitized}`;
        const label = attrLabels[attr] || attr;
        const bandLabel = bandLabels[band] || band || 'n/a';
        pill.textContent = `${label}: ${bandLabel}`;
        bandContainer.appendChild(pill);
      });

      if (resultsList) {
        resultsList.appendChild(card);
      }
    });
  };

  const renderSolutions = (solutions, summaryLines, infoMessages) => {
    latestSolutions = Array.isArray(solutions) ? [...solutions] : [];
    latestSummaryLines = Array.isArray(summaryLines) ? [...summaryLines] : [];
    latestInfoMessages = Array.isArray(infoMessages) ? [...infoMessages] : [];
    hasRenderedResults = true;
    applyResultsState();
  };

  if (sortAttrSelect) {
    sortAttrSelect.addEventListener('change', applyResultsState);
  }

  if (sortOrderSelect) {
    sortOrderSelect.addEventListener('change', applyResultsState);
  }

  const renderDebug = (lines) => {
    if (!debugPanel || !debugOutput) return;
    if (!lines.length) {
      debugPanel.hidden = true;
      debugOutput.textContent = '';
      return;
    }
    debugPanel.hidden = false;
    debugOutput.textContent = lines.join('\n');
  };

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      let styleName = formData.get('style');
      if (!styleName && styleIds.length) {
        styleName = styleIds[0];
      }
      if (styleName && !(styleName in stylesData) && styleIds.length) {
        styleName = styleIds[0];
      }
      const totalCapRaw = Number(formData.get('total_cap'));
      const perCapRaw = Number(formData.get('per_cap'));
      const totalCap = clamp(Number.isFinite(totalCapRaw) ? totalCapRaw : 25, 1, 99);
      const perCap = clamp(Number.isFinite(perCapRaw) ? perCapRaw : 25, 1, 99);

      const numericIntervals = {};
      const bandPreferences = {};
      const debugIntervals = {};
      const debugLines = [];

      ATTRS.forEach((attr) => {
        const bandChoice = formData.get(`band_${attr}`) || 'any';
        bandPreferences[attr] = bandChoice === 'any' ? null : [bandChoice];

        const mode = formData.get(`mode_${attr}`) || 'any';
        const rawMin = parseFloatOrNull(formData.get(`min_${attr}`));
        const rawMax = parseFloatOrNull(formData.get(`max_${attr}`));
        const minVal = rawMin === null ? null : clamp(rawMin, 0, 11);
        const maxVal = rawMax === null ? null : clamp(rawMax, 0, 11);

        let lo = Number.NEGATIVE_INFINITY;
        let hi = Number.POSITIVE_INFINITY;
        let debugLo = 0;
        let debugHi = 11;

        if (mode === 'ge') {
          lo = minVal === null ? 0 : minVal;
          debugLo = lo;
          debugHi = Number.POSITIVE_INFINITY;
        } else if (mode === 'le') {
          hi = maxVal === null ? 11 : maxVal;
          debugLo = Number.NEGATIVE_INFINITY;
          debugHi = hi;
        } else if (mode === 'eq') {
          const target = minVal !== null ? minVal : maxVal;
          if (target !== null) {
            lo = target;
            hi = target;
            debugLo = target;
            debugHi = target;
          } else {
            debugLo = 0;
            debugHi = 11;
          }
        } else {
          debugLo = 0;
          debugHi = 11;
        }

        numericIntervals[attr] = [lo, hi];
        debugIntervals[attr] = [debugLo, debugHi];
      });

      const selectedOptional = new Set(formData.getAll('optional_ingredients'));
      const extraMinCounts = {};
      selectedOptional.forEach((id) => {
        extraMinCounts[id] = Math.max(extraMinCounts[id] || 0, 1);
      });

      const styleLabel = displayStyleName(styleName) || translate('style_unknown');
      debugLines.push(translate('debug_style', { style: styleLabel }));
      debugLines.push(translate('debug_caps', { total: totalCap, per: perCap }));
      debugLines.push(translate('debug_attr_heading'));
      ATTRS.forEach((attr) => {
        const interval = debugIntervals[attr] || [0, 11];
        const bandPref = bandPreferences[attr];
        const bandKey = bandPref && bandPref.length === 1 ? bandPref[0] : 'any';
        const bandText = bandLabels[bandKey] || bandKey;
        debugLines.push(
          translate('debug_attr_entry', {
            label: attrLabels[attr] || attr,
            band: bandText,
            min: formatIntervalValue(interval[0]),
            max: formatIntervalValue(interval[1]),
          }),
        );
      });
      if (selectedOptional.size) {
        const optionalList = Array.from(selectedOptional)
          .map((id) => displayIngredientName(id))
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        debugLines.push(translate('debug_optional', { list: optionalList.join(', ') }));
      }

      const { solutions, info } = solveRecipe({
        styleName,
        numericIntervals,
        bandPreferences,
        totalCap,
        perCap,
        extraMinCounts,
      });

      const summaryLines = [];
      if (styleName) {
        summaryLines.push(translate('summary_style', { style: displayStyleName(styleName) }));
      }
      summaryLines.push(translate('summary_caps', { total: totalCap, per: perCap }));

      renderSolutions(solutions, summaryLines, info);
      renderDebug(debugLines);
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSolver);
} else {
  initSolver();
}
