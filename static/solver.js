import {
  solveRecipe as solveRecipeSync,
  EPS,
  getIngredientId,
  DEFAULT_TOP_K,
  computeWeightedOrder,
  computeSuffixBounds,
  SEASON_ORDER,
} from './solver-core.js';
import { initUIState } from './ui-state.js';
import { renderResults, renderDebug } from './render.js';
import { initSlider } from './slider.js';
import { formatTemplate, createTranslator } from './i18n.js';

let ingredientList = [];
let ingredientIdToIndexMap = new Map();
let ingredientIdToDisplayNameMap = new Map();
let ingredientCategoryIdToElementsMap = new Map();

const WORKER_MIN_INGREDIENTS = 1;

const createSolverWorkerController = (initPayload) => {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }

  let worker;
  try {
    worker = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
  } catch (error) {
    console.warn('Failed to create solver worker', error);
    return null;
  }

  const pending = new Map();
  let nextId = 1;

  const rejectAll = (error) => {
    const reason = error instanceof Error ? error : new Error(String(error || 'Worker error'));
    pending.forEach(({ reject }) => {
      try {
        reject(reason);
      } catch (rejectError) {
        console.error('Solver worker rejection failed', rejectError);
      }
    });
    pending.clear();
  };

  worker.addEventListener('message', (event) => {
    const data = event.data || {};
    const { id, type, payload, error } = data;
    if (id === undefined || id === null || !pending.has(id)) {
      return;
    }
    const { resolve, reject } = pending.get(id);
    pending.delete(id);
    if (type === 'error') {
      reject(error instanceof Error ? error : new Error(String((error && error.message) || error || 'Worker error')));
    } else {
      resolve(payload);
    }
  });

  worker.addEventListener('error', (event) => {
    rejectAll(event?.error || event?.message || 'Worker runtime error');
  });

  worker.addEventListener('messageerror', (event) => {
    rejectAll(event?.data || 'Worker message error');
  });

  const post = (type, payload) => {
    if (!worker) {
      return Promise.reject(new Error('Worker not available'));
    }
    const id = nextId;
    nextId += 1;
    const message = { id, type, payload };
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    try {
      worker.postMessage(message);
    } catch (error) {
      pending.delete(id);
      return Promise.reject(error);
    }
    return promise;
  };

  const ready = post('init', initPayload).catch((error) => {
    rejectAll(error);
    return Promise.reject(error);
  });

  const solve = (params) => ready.then(() => post('solve', { params }));

  return {
    ready,
    solve,
    terminate: () => {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      rejectAll(new Error('Worker terminated'));
    },
  };
};

const firstStringValue = (values) => {
  for (const value of values) {
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
};

const resolveIngredientDisplayName = (ingredient, id, ingredientNames, currentLang) => {
  if (ingredientNames && typeof ingredientNames[id] === 'string' && ingredientNames[id].length) {
    return ingredientNames[id];
  }

  const localizedNames = ingredient && typeof ingredient.names === 'object' ? ingredient.names : null;
  if (localizedNames) {
    if (currentLang && typeof localizedNames[currentLang] === 'string' && localizedNames[currentLang].length) {
      return localizedNames[currentLang];
    }
    if (typeof localizedNames.en === 'string' && localizedNames.en.length) {
      return localizedNames.en;
    }
    if (typeof localizedNames.de === 'string' && localizedNames.de.length) {
      return localizedNames.de;
    }
    const fallback = firstStringValue(Object.values(localizedNames));
    if (fallback) {
      return fallback;
    }
  }

  if (ingredient && typeof ingredient.name === 'string' && ingredient.name.length) {
    return ingredient.name;
  }

  return id;
};

const buildIngredientCaches = (list, ingredientNames, currentLang) => {
  ingredientList = Array.isArray(list) ? list : [];
  ingredientIdToIndexMap = new Map();
  ingredientIdToDisplayNameMap = new Map();
  ingredientCategoryIdToElementsMap = new Map();

  ingredientList.forEach((ingredient, idx) => {
    const id = getIngredientId(ingredient, idx);
    ingredientIdToIndexMap.set(id, idx);

    const displayName = resolveIngredientDisplayName(ingredient, id, ingredientNames, currentLang);
    ingredientIdToDisplayNameMap.set(id, displayName);

    let categoryId = 'uncategorized';
    if (ingredient && ingredient.category !== undefined && ingredient.category !== null) {
      const normalized = String(ingredient.category).trim();
      if (normalized.length) {
        categoryId = normalized;
      }
    }
    if (!ingredientCategoryIdToElementsMap.has(categoryId)) {
      ingredientCategoryIdToElementsMap.set(categoryId, []);
    }
    ingredientCategoryIdToElementsMap.get(categoryId).push({ index: idx, ingredient });
  });

  if (ingredientNames && typeof ingredientNames === 'object') {
    Object.entries(ingredientNames).forEach(([id, label]) => {
      if (typeof label === 'string' && label.length) {
        ingredientIdToDisplayNameMap.set(id, label);
      }
    });
  }
};

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

const initSolver = () => {
  const i18nData = parseJSONScript('i18n-data', {});
  const styleMinMap = parseJSONScript('style-min-data', {});
  const rawIngredientData = parseJSONScript('ingredients-data', []);
  const ingredients = Array.isArray(rawIngredientData) ? rawIngredientData : [];
  const stylesData = parseJSONScript('styles-data', {});
  const metaData = parseJSONScript('meta-data', {});

  const ui = initUIState();
  const { attrs: attrState, bands, selectors, selection: selectionState } = ui;

  const ATTRS = Array.isArray(metaData.attrs) && metaData.attrs.length
    ? metaData.attrs
    : (attrState.list && attrState.list.length ? attrState.list : ['taste', 'color', 'strength', 'foam']);
  const attrLabels = metaData.attr_labels || metaData.attrLabels || {};
  const bandLabels = metaData.band_labels || metaData.bandLabels || {};
  const SLIDER_MAX_VALUE = attrState.sliderMaxValue;
  const SLIDER_STEP_SCALE = attrState.sliderStepScale;
  const sliderBandColorMap = bands.colorMap;
  const sliderBandMutedColorMap = bands.mutedColorMap;
  const sliderNeutralColor = bands.neutralColor;

  const sliderHelpers = initSlider({
    maxValue: SLIDER_MAX_VALUE,
    stepScale: SLIDER_STEP_SCALE,
    colorMap: sliderBandColorMap,
    mutedColorMap: sliderBandMutedColorMap,
    neutralColor: sliderNeutralColor,
  });
  const { sliderStepToNumber, formatSliderValue, normalizeTrackBand, applyTrack, createSlider } =
    sliderHelpers;
  let sliderTrackController = applyTrack({});

  const messages = i18nData.messages || {};
  const uiStrings = i18nData.ui || {};
  const ingredientNames = i18nData.ingredient_names || {};
  const styleNameMap = i18nData.style_names || {};
  const currentLang = i18nData.lang || 'en';

  buildIngredientCaches(ingredients, ingredientNames, currentLang);

  const translate = createTranslator(messages, uiStrings);

  const costFormatter = new Intl.NumberFormat(currentLang, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formatCost = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return '—';
    }
    return costFormatter.format(num);
  };

  const seasonLabels = {};
  SEASON_ORDER.forEach((season) => {
    const label = translate(`season_${season}`);
    seasonLabels[season] = typeof label === 'string' ? label : season;
  });

  let workerController = null;
  if (Array.isArray(ingredients) && ingredients.length >= WORKER_MIN_INGREDIENTS) {
    workerController = createSolverWorkerController({
      attrs: ATTRS,
      styles: stylesData,
      ingredients,
      messages,
      uiStrings,
      styleNameMap,
    });
    if (workerController) {
      workerController.ready.catch((error) => {
        console.warn('Solver worker initialization failed; falling back to main thread', error);
        if (workerController) {
          workerController.terminate();
          workerController = null;
        }
      });
    }
  }

  const displayIngredientName = (id) => {
    if (!id) {
      return translate('style_unknown');
    }
    if (ingredientNames && typeof ingredientNames[id] === 'string' && ingredientNames[id].length) {
      return ingredientNames[id];
    }
    if (ingredientIdToDisplayNameMap.has(id)) {
      return ingredientIdToDisplayNameMap.get(id);
    }
    return id;
  };

  const displayStyleName = (id) => {
    if (!id) {
      return translate('style_unknown');
    }
    return styleNameMap[id] || id;
  };

  const runSolveOnMainThread = (request) => solveRecipeSync({
    ...request,
    attrs: ATTRS,
    styles: stylesData,
    ingredients,
    translate,
    displayStyleName,
  });

  const {
    attrCards,
    submitBtn,
    setAllGreenBtn,
    styleSelect,
    ingredientRows,
    form,
    ingredientsWrapper,
    optionalToggle: optionalToggleBtn,
    detailsToggle: detailsToggleBtn,
    categoryPanels,
    categoryTabs,
    targetSummaryRows,
    resultsSection,
    resultsTitle,
    resultsSummary,
    resultsPlaceholder,
    resultsLoading,
    resultsList,
    resultsEmpty,
    statusMessage,
    debugToggle,
    debugContent,
    legacyToggle,
    mixPanel,
    mixList,
    mixSummary,
    mixCaps,
    styleGhosts,
  } = selectors;

  const totalCapInput = form ? form.querySelector('input[name="total_cap"]') : null;
  const perCapInput = form ? form.querySelector('input[name="per_cap"]') : null;

  const mixCapElements = new Map();
  mixCaps.forEach((valueEl) => {
    if (!valueEl) {
      return;
    }
    const wrapper = valueEl.closest('[data-cap]');
    if (!wrapper) {
      return;
    }
    const type = wrapper.dataset.cap || 'total';
    mixCapElements.set(type, { wrapper, valueEl });
  });

  const targetSummaryMap = new Map();
  targetSummaryRows.forEach((row, attr) => {
    if (!row) {
      return;
    }
    const valueEl = row.querySelector('[data-target-summary-value]');
    if (valueEl) {
      targetSummaryMap.set(attr, valueEl);
    }
  });

  let resultsState = {
    loading: false,
    solutions: null,
    summary: [],
    info: [],
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const applyHighlightToCardSlider = (card, highlightBand) => {
    if (!card) {
      return;
    }
    const slider = card.querySelector('[data-attr-range]');
    if (!slider) {
      return;
    }
    const attr = card.dataset.attr;
    if (!attr) {
      slider.style.removeProperty('--slider-track');
      return;
    }
    sliderTrackController.setTrack(slider, attr, highlightBand);
  };

  const styleGhostElements = new Map();
  styleGhosts.forEach((ghostEl, attr) => {
    if (!ghostEl) {
      return;
    }
    const track = ghostEl.querySelector('[data-style-ghost-track]');
    styleGhostElements.set(attr, { root: ghostEl, track });
  });

  const normalizeGhostSegments = (segments = []) => {
    if (!Array.isArray(segments) || segments.length === 0) {
      return [];
    }
    return segments
      .map((segment) => {
        const hasMin = segment && Object.prototype.hasOwnProperty.call(segment, 'min');
        const hasStart = segment && Object.prototype.hasOwnProperty.call(segment, 'start');
        const hasMax = segment && Object.prototype.hasOwnProperty.call(segment, 'max');
        const hasEnd = segment && Object.prototype.hasOwnProperty.call(segment, 'end');
        const rawMin = hasMin ? segment.min : hasStart ? segment.start : undefined;
        const rawMax = hasMax ? segment.max : hasEnd ? segment.end : undefined;
        const min = clamp(Number(rawMin) || 0, 0, SLIDER_MAX_VALUE);
        const max = clamp(Number(rawMax) || SLIDER_MAX_VALUE, 0, SLIDER_MAX_VALUE);
        const band = normalizeTrackBand(segment && segment.band) || 'neutral';
        return {
          start: min,
          end: Math.max(min, max),
          band,
        };
      })
      .filter((segment) => segment.end - segment.start > EPS)
      .sort((a, b) => a.start - b.start || a.end - b.end);
  };

  const updateStyleGhosts = (bandsByAttr = {}) => {
    styleGhostElements.forEach(({ root, track }, attr) => {
      if (!root || !track) {
        return;
      }
      const segments = normalizeGhostSegments(bandsByAttr && bandsByAttr[attr]);
      while (track.firstChild) {
        track.removeChild(track.firstChild);
      }
      if (!segments.length) {
        root.dataset.hasRange = 'false';
        return;
      }
      const fragment = document.createDocumentFragment();
      segments.forEach((segment) => {
        const segmentEl = document.createElement('span');
        segmentEl.className = 'style-ghost__segment';
        segmentEl.dataset.band = segment.band || 'neutral';
        const startPercent = (segment.start / SLIDER_MAX_VALUE) * 100;
        const sizePercent = ((segment.end - segment.start) / SLIDER_MAX_VALUE) * 100;
        segmentEl.style.left = `${startPercent}%`;
        segmentEl.style.width = `${sizePercent}%`;
        fragment.appendChild(segmentEl);
      });
      track.appendChild(fragment);
      root.dataset.hasRange = 'true';
    });
  };

  const readCapValue = (input, fallback) => {
    if (!input) {
      return fallback;
    }
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return clamp(parsed, 1, 99);
  };

  const getCapLimits = () => ({
    total: readCapValue(totalCapInput, 25),
    per: readCapValue(perCapInput, 25),
  });

  const setCapProgress = (type, used, limit) => {
    const entry = mixCapElements.get(type);
    if (!entry) {
      return;
    }
    const { wrapper, valueEl } = entry;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : Math.max(used, 1);
    const ratio = safeLimit > 0 ? Math.min(Math.max(used / safeLimit, 0), 1) : 0;
    wrapper.style.setProperty('--cap-progress', ratio);
    wrapper.dataset.state = used >= safeLimit ? 'full' : used > 0 ? 'active' : 'idle';
    if (valueEl) {
      if (type === 'per') {
        valueEl.textContent = `${used}`;
      } else {
        valueEl.textContent = `${used} / ${safeLimit}`;
      }
    }
  };

  const refreshMixSummary = () => {
    if (!mixList) {
      return;
    }
    const summaryItems = [];
    let totalSelected = 0;
    let optionalSelected = 0;

    ingredientRows.forEach((row) => {
      if (!row) {
        return;
      }
      const includeCheckbox = row.querySelector('input[type="checkbox"][name="selected_ingredients"]');
      const optionalCheckbox = row.querySelector('input[type="checkbox"][name="optional_ingredients"]');
      const nameEl = row.querySelector('.ingredient-card__name');
      const ingredientId = row.dataset.ingredientId || '';
      const isOptional = optionalCheckbox ? optionalCheckbox.checked && !optionalCheckbox.disabled : false;
      if (isOptional) {
        optionalSelected += 1;
      }

      const isIncluded = includeCheckbox ? includeCheckbox.checked : false;
      const isRequired = includeCheckbox ? includeCheckbox.disabled : false;

      if (!isIncluded && !isOptional) {
        return;
      }

      if (isIncluded) {
        totalSelected += 1;
      }

      const label = nameEl ? nameEl.textContent.trim() : displayIngredientName(ingredientId);

      summaryItems.push({
        id: ingredientId,
        label,
        required: isRequired && isIncluded,
        optional: isOptional && !isRequired,
      });
    });

    mixList.innerHTML = '';
    if (!summaryItems.length) {
      const empty = document.createElement('li');
      empty.className = 'mix-summary__item mix-summary__item--empty';
      empty.textContent = uiStrings.mix_empty || translate('mix_empty');
      mixList.appendChild(empty);
      if (mixPanel) {
        mixPanel.dataset.empty = 'true';
      }
    } else {
      summaryItems.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'mix-summary__item';
        li.dataset.status = item.required ? 'required' : item.optional ? 'optional' : 'selected';

        const name = document.createElement('span');
        name.className = 'mix-summary__name';
        name.textContent = item.label || displayIngredientName(item.id);
        li.appendChild(name);

        const badge = document.createElement('span');
        badge.className = 'mix-summary__badge';
        if (item.required) {
          badge.textContent = uiStrings.badge_required_single || 'Required';
        } else if (item.optional) {
          badge.textContent = uiStrings.label_optional || 'Optional';
        } else {
          badge.textContent = uiStrings.label_include || 'Included';
        }
        li.appendChild(badge);

        mixList.appendChild(li);
      });
      if (mixPanel) {
        mixPanel.dataset.empty = 'false';
      }
    }

    const caps = getCapLimits();
    setCapProgress('total', totalSelected, caps.total);
    setCapProgress('per', optionalSelected, caps.per);
  };

  const categoryPanelEntries = Array.from(categoryPanels.entries());
  const categoryTabEntries = Array.from(categoryTabs.entries());

  const activateCategory = (categoryId) => {
    const targetId = categoryId || (categoryPanelEntries.length ? categoryPanelEntries[0][0] : null);
    categoryPanelEntries.forEach(([id, panel]) => {
      const isActive = id === targetId;
      if (panel) {
        panel.hidden = !isActive;
        panel.dataset.active = isActive ? 'true' : 'false';
      }
    });
    categoryTabEntries.forEach(([id, tab]) => {
      const isActive = id === targetId;
      if (tab) {
        tab.classList.toggle('ingredient-tab--active', isActive);
        tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        tab.dataset.active = isActive ? 'true' : 'false';
      }
    });
    if (ingredientsWrapper) {
      ingredientsWrapper.dataset.activeCategory = targetId || '';
    }
  };

  categoryTabEntries.forEach(([id, tab], index) => {
    if (!tab) {
      return;
    }
    if (index === 0 && !tab.dataset.active) {
      tab.dataset.active = 'false';
    }
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      activateCategory(id);
    });
  });

  if (categoryTabEntries.length) {
    const preferredTab = categoryTabEntries.find(([, tab]) => tab && tab.dataset.initial === 'true');
    if (preferredTab) {
      activateCategory(preferredTab[0]);
    } else {
      activateCategory(categoryTabEntries[0][0]);
    }
  } else {
    categoryPanelEntries.forEach(([, panel]) => {
      if (panel) {
        panel.hidden = false;
      }
    });
  }

  const LEGACY_MODE_STORAGE_KEY = 'ale-abbey-legacy-mode';

  const applyLegacyMode = (enabled) => {
    if (legacyToggle) {
      legacyToggle.checked = !!enabled;
    }
    if (document.body) {
      if (enabled) {
        document.body.classList.add('legacy-mode');
      } else {
        document.body.classList.remove('legacy-mode');
      }
    }
    try {
      window.localStorage.setItem(LEGACY_MODE_STORAGE_KEY, enabled ? '1' : '0');
    } catch (error) {
      console.warn('Failed to persist legacy mode preference', error);
    }
  };

  let initialLegacyMode = false;
  try {
    initialLegacyMode = window.localStorage.getItem(LEGACY_MODE_STORAGE_KEY) === '1';
  } catch (error) {
    initialLegacyMode = false;
  }
  applyLegacyMode(initialLegacyMode);

  if (legacyToggle) {
    legacyToggle.addEventListener('change', () => {
      applyLegacyMode(!!legacyToggle.checked);
    });
  }

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
    allowedIngredientIds,
    topK = DEFAULT_TOP_K,
  }) => {
    const style = stylesData[styleName];
    if (!style) {
      return { solutions: [], info: [translate('unknown_style', { style: displayStyleName(styleName) })] };
    }

    const n = ingredients.length;
    const base = (style.base || [0, 0, 0, 0]).map(Number);
    const vectors = ingredients.map((ing) => (ing.vec || [0, 0, 0, 0]).map(Number));
    const idToIndex = ingredientIdToIndexMap;

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
    const allowedSet = allowedIngredientIds instanceof Set
      ? new Set(allowedIngredientIds)
      : Array.isArray(allowedIngredientIds)
        ? new Set(allowedIngredientIds)
        : null;

    const perIngredientCeilValues = new Array(n).fill(0);
    for (let idx = 0; idx < n; idx += 1) {
      const id = getIngredientId(ingredients[idx], idx);
      const required = minCounts[idx] > 0;
      const optionalAllowed = allowedSet === null || allowedSet.has(id);
      const isAllowed = required || optionalAllowed;
      perIngredientCeilValues[idx] = isAllowed ? Math.min(perCap, adjustedTotalCap) : minCounts[idx];
    }
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
      const perIngredientCeil = perIngredientCeilValues[idx];
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

    const orderedIndices = computeWeightedOrder(vectors);
    const orderedVectors = orderedIndices.map((idx) => vectors[idx]);
    const orderedMinCounts = orderedIndices.map((idx) => minCounts[idx]);
    const orderedMaxCounts = orderedIndices.map((idx) => perIngredientCeilValues[idx]);

    const { suffixMinCounts, suffixLo, suffixHi } = computeSuffixBounds(
      orderedVectors,
      orderedMinCounts,
      orderedMaxCounts,
      ATTRS.length,
    );
    if (suffixMinCounts[0] > adjustedTotalCap) {
      return { solutions: [], info: [translate('cap_too_small')] };
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

  const updateSliderTracksForStyle = (styleName) => {
    const style = styleName ? stylesData[styleName] : null;
    const styleBands = style && style.bands ? style.bands : {};
    sliderTrackController = applyTrack(styleBands);

    attrCards.forEach((card) => {
      const slider = card.querySelector('[data-attr-range]');
      if (!slider) {
        return;
      }
      const attr = card.dataset.attr;
      const highlightBand = card.dataset.activeColorBand || null;
      if (!attr) {
        slider.style.removeProperty('--slider-track');
        return;
      }
      sliderTrackController.setTrack(slider, attr, highlightBand);
    });
  };

  const colorStateUpdaters = selectionState.colorUpdaters;
  const attrControllers = new Map();
  const colorCardEventHandlersByType = new Map();
  const colorEventContainers = new Map();
  const radioPointerState = new WeakMap();
  const pointerDownEvent =
    typeof window !== 'undefined' && window.PointerEvent ? 'pointerdown' : 'mousedown';
  const schedulePostClick = (callback) => {
    if (typeof callback !== 'function') {
      return;
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(callback);
    } else {
      setTimeout(callback, 0);
    }
  };
  let allGreenWatcher = null;

  const getColorHandlerMap = (type) => {
    if (!colorCardEventHandlersByType.has(type)) {
      colorCardEventHandlersByType.set(type, new Map());
    }
    return colorCardEventHandlersByType.get(type);
  };

  const registerColorContainer = (type, container) => {
    if (!colorEventContainers.has(type) && container) {
      colorEventContainers.set(type, container);
    }
  };

  const getOptionalCheckboxes = () =>
    ingredientRows
      .map((row) => row.querySelector('input[type="checkbox"][name="optional_ingredients"]'))
      .filter((checkbox) => checkbox && typeof checkbox.checked === 'boolean');

  const getEnabledOptionalCheckboxes = () =>
    getOptionalCheckboxes().filter((checkbox) => !checkbox.disabled);

  const updateOptionalToggleState = () => {
    if (!optionalToggleBtn) {
      return;
    }
    const enabled = getEnabledOptionalCheckboxes();
    const allChecked = enabled.length > 0 && enabled.every((checkbox) => checkbox.checked);
    const hasAny = enabled.some((checkbox) => checkbox.checked);
    optionalToggleBtn.disabled = enabled.length === 0;
    const labelEl = optionalToggleBtn.querySelector('[data-toggle-optional-label]');
    const selectLabel = optionalToggleBtn.dataset.labelSelect || optionalToggleBtn.textContent || '';
    const clearLabel = optionalToggleBtn.dataset.labelClear || optionalToggleBtn.textContent || '';
    const nextLabel = allChecked ? clearLabel : selectLabel;
    if (labelEl) {
      labelEl.textContent = nextLabel;
    } else {
      optionalToggleBtn.textContent = nextLabel;
    }
    optionalToggleBtn.dataset.state = allChecked ? 'all' : hasAny ? 'some' : 'none';
  };

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
    const sliderRoot = card.querySelector('[data-slider]');
    const sliderController = sliderRoot ? createSlider(sliderRoot) : null;
    const sliderMinHandle = sliderController ? sliderController.getHandle('min') : null;
    const sliderMaxHandle = sliderController ? sliderController.getHandle('max') : null;
    const sliderHandles = sliderController ? sliderController.getHandles() : [];
    const sliderDisplay = card.querySelector('[data-slider-display]');
    const sliderSingleContainer = sliderDisplay ? sliderDisplay.querySelector('[data-slider-single]') : null;
    const sliderRangeContainer = sliderDisplay ? sliderDisplay.querySelector('[data-slider-range]') : null;
    const sliderSingleValueEl = sliderDisplay ? sliderDisplay.querySelector('[data-slider-single-value]') : null;
    const sliderMinValueEl = sliderDisplay ? sliderDisplay.querySelector('[data-slider-min-value]') : null;
    const sliderMaxValueEl = sliderDisplay ? sliderDisplay.querySelector('[data-slider-max-value]') : null;
    const copyBtn = card.querySelector('[data-copy-attr]');
    const modeButtons = Array.from(card.querySelectorAll('[data-mode-btn]'));
    const modeInput = card.querySelector('[data-mode-input]');
    const minInput = card.querySelector('[data-min-input]');
    const maxInput = card.querySelector('[data-max-input]');
    const attrControls = card.querySelector('[data-slider-area]');
    const colorGroup = card.querySelector('[data-color-group]');
    const colorRadios = Array.from(card.querySelectorAll('input[type="radio"][data-color-radio]'));
    const colorChips = colorRadios.map((radio) => radio.closest('[data-color]'));
    const clearBtn = card.querySelector('[data-clear-color]');
    const attrName = card.dataset.attr || null;
    const fineToggle = card.querySelector('[data-attr-fine-toggle]');
    const advancedContainer = card.querySelector('[data-attr-advanced]');
    const hasAdvancedControls = !!(modeInput && minInput && maxInput);
    const cardType = hasAdvancedControls ? 'range' : 'simple';

    let advancedExpanded = false;
    const setAdvancedVisibility = (visible) => {
      if (!advancedContainer) {
        return;
      }
      advancedExpanded = !!visible;
      if (advancedExpanded) {
        advancedContainer.hidden = false;
        advancedContainer.dataset.expanded = 'true';
      } else {
        advancedContainer.hidden = true;
        advancedContainer.dataset.expanded = 'false';
      }
      if (fineToggle) {
        fineToggle.dataset.expanded = advancedExpanded ? 'true' : 'false';
        fineToggle.setAttribute('aria-expanded', advancedExpanded ? 'true' : 'false');
      }
    };

    if (advancedContainer) {
      if (!advancedContainer.hasAttribute('hidden')) {
        setAdvancedVisibility(true);
      } else {
        setAdvancedVisibility(false);
      }
    }

    if (fineToggle && advancedContainer) {
      fineToggle.addEventListener('click', () => {
        setAdvancedVisibility(!advancedExpanded);
      });
    }

    const syncCardSliderHighlight = (band) => {
      const sanitizedBand = normalizeTrackBand(band);
      if (sanitizedBand) {
        card.dataset.activeColorBand = sanitizedBand;
        if (sliderController) {
          sliderController.setActiveBand(sanitizedBand);
        } else if (sliderRoot) {
          sliderRoot.dataset.activeColorBand = sanitizedBand;
        }
        sliderHandles.forEach((handle) => {
          if (handle) {
            handle.dataset.activeColorBand = sanitizedBand;
          }
        });
      } else {
        delete card.dataset.activeColorBand;
        if (sliderController) {
          sliderController.setActiveBand(null);
        } else if (sliderRoot) {
          delete sliderRoot.dataset.activeColorBand;
        }
        sliderHandles.forEach((handle) => {
          if (handle) {
            delete handle.dataset.activeColorBand;
          }
        });
      }
      applyHighlightToCardSlider(card, sanitizedBand);
    };

    const syncColorChipVisuals = () => {
      colorRadios.forEach((radio, index) => {
        const chip = colorChips[index];
        if (!chip) return;
        const isSelected = !!radio.checked;
        if (isSelected) {
          chip.dataset.selected = 'true';
        } else {
          delete chip.dataset.selected;
        }
      });
    };

    const findColorRadio = (target) => {
      if (!target) return null;
      if (target.matches && target.matches('input[type="radio"][data-color-radio]')) {
        return target;
      }
      const chip = target.closest('[data-color]');
      if (!chip) return null;
      return chip.querySelector('input[type="radio"][data-color-radio]');
    };

    const setColorSelectionValue = (value) => {
      let selected = null;
      colorRadios.forEach((radio) => {
        const isSelected = value != null && radio.value === value;
        radio.checked = isSelected;
        if (isSelected) {
          selected = radio;
        }
      });
      return selected;
    };

    let updateColorState = () => {};

    const applyColorSelection = (value, { focus = true } = {}) => {
      const selected = setColorSelectionValue(value);
      updateColorState();
      if (typeof allGreenWatcher === 'function') {
        allGreenWatcher();
      }
      if (focus && selected && typeof selected.focus === 'function') {
        selected.focus();
      }
    };

    const isToggleKey = (event) => {
      const key = event.key;
      return key === ' ' || key === 'Spacebar' || key === 'Space' || key === 'Enter';
    };

    const handleColorGroupEvent = (event) => {
      if (!colorGroup) {
        return;
      }
      const radio = findColorRadio(event.target);
      if (!radio || radio.disabled) {
        return;
      }

      if (event.type === pointerDownEvent) {
        radioPointerState.set(radio, radio.checked);
        return;
      }

      if (event.type === 'keydown') {
        if (!isToggleKey(event)) {
          return;
        }
        event.preventDefault();
        const nextValue = radio.checked ? null : radio.value;
        applyColorSelection(nextValue);
        return;
      }

      if (event.type === 'click') {
        const wasChecked = radioPointerState.has(radio)
          ? radioPointerState.get(radio)
          : radio.checked;
        radioPointerState.delete(radio);
        if (wasChecked && radio.checked) {
          schedulePostClick(() => {
            applyColorSelection(null, { focus: false });
          });
          return;
        }
        applyColorSelection(radio.value, { focus: false });
        return;
      }

      if (event.type === 'change') {
        const value = radio.checked ? radio.value : null;
        applyColorSelection(value, { focus: false });
        radioPointerState.delete(radio);
      }
    };

    if (colorGroup) {
      registerColorContainer(cardType, form || document);
      getColorHandlerMap(cardType).set(card, handleColorGroupEvent);
    }

    if (!hasAdvancedControls) {
      updateColorState = () => {
        const selected = colorRadios.find((radio) => radio.checked) || null;
        syncColorChipVisuals();
        syncCardSliderHighlight(selected ? selected.value : null);
        updateSubmitState();
      };

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          applyColorSelection(null, { focus: false });
        });
      }

      if (attrName) {
        const summaryEl = targetSummaryMap.get(attrName);
        if (summaryEl && sliderSingleValueEl) {
          const text = sliderSingleValueEl.textContent?.trim();
          summaryEl.textContent = text || sliderSingleValueEl.textContent || '–';
        }
      }

      updateColorState();
      colorStateUpdaters.push(updateColorState);
      return;
    }

    const readInitialSliderValue = () => {
      const source = sliderMinHandle || sliderMaxHandle;
      if (!source) {
        return null;
      }
      const raw = Number(source.dataset.initialValue);
      if (Number.isFinite(raw)) {
        return clamp(raw, 0, 11);
      }
      if (sliderController) {
        const key = sliderController.getHandleKey(source);
        if (key) {
          return clamp(sliderController.getValue(key), 0, 11);
        }
      }
      return null;
    };

    const sliderInitialValue = readInitialSliderValue();

    const parseNumeric = (raw, fallback) => {
      if (raw === null || raw === undefined || raw === '') {
        return fallback;
      }
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? clamp(numeric, 0, 11) : fallback;
    };

    const sanitizeModeValue = (mode) => {
      if (mode === 'ge' || mode === 'le' || mode === 'eq' || mode === 'between') {
        return mode;
      }
      return 'any';
    };

    let currentMode = sanitizeModeValue(modeInput.value);
    if (currentMode === 'between' && (!sliderMinHandle || !sliderMaxHandle)) {
      currentMode = sliderMinHandle ? 'ge' : sliderMaxHandle ? 'le' : 'any';
      modeInput.value = currentMode;
    }

    const fallbackValue = Number.isFinite(sliderInitialValue) ? sliderInitialValue : 5.5;

    const storedValues = {
      eq: parseNumeric(currentMode === 'eq' ? (minInput.value || maxInput.value) : null, null),
      ge: parseNumeric(minInput.value, null),
      le: parseNumeric(maxInput.value, null),
    };

    if (!Number.isFinite(storedValues.eq)) {
      storedValues.eq = fallbackValue;
    }
    if (!Number.isFinite(storedValues.ge)) {
      storedValues.ge = storedValues.eq;
    }
    if (!Number.isFinite(storedValues.le)) {
      storedValues.le = storedValues.eq;
    }

    let savedNumericMode = currentMode !== 'any' ? currentMode : null;
    let isUpdatingHandles = false;

    const clampSliderValue = (value) => clamp(Number.isFinite(value) ? value : fallbackValue, 0, 11);

    const setSliderHandleValue = (handle, value) => {
      const safe = clampSliderValue(value);
      if (!handle || !sliderController) {
        return safe;
      }
      const key = sliderController.getHandleKey(handle);
      if (key) {
        sliderController.setValue(key, safe);
      }
      handle.setAttribute('aria-valuenow', formatSliderValue(safe));
      return safe;
    };

    const setHandleState = (handle, { visible, role, value, zIndex }) => {
      if (!handle) {
        return;
      }
      const safeValue = setSliderHandleValue(handle, value);
      if (role) {
        handle.dataset.handleRole = role;
      } else {
        delete handle.dataset.handleRole;
      }
      if (sliderController) {
        const key = sliderController.getHandleKey(handle);
        if (key) {
          sliderController.setVisibility(key, visible);
          sliderController.setZIndex(key, zIndex);
        }
      } else {
        if (typeof zIndex === 'number') {
          handle.style.zIndex = String(zIndex);
        } else {
          handle.style.removeProperty('z-index');
        }
        if (visible) {
          handle.style.removeProperty('display');
          handle.removeAttribute('aria-hidden');
          handle.removeAttribute('tabindex');
          handle.removeAttribute('disabled');
        } else {
          handle.style.display = 'none';
          handle.setAttribute('aria-hidden', 'true');
          handle.setAttribute('tabindex', '-1');
          handle.setAttribute('disabled', 'true');
        }
      }
      return safeValue;
    };

    const getModeFlags = () => ({
      eq: currentMode === 'eq',
      ge: currentMode === 'ge' || currentMode === 'between',
      le: currentMode === 'le' || currentMode === 'between',
    });

    const setModeButtonsState = () => {
      modeButtons.forEach((btn) => {
        const btnMode = btn.dataset.mode;
        let isActive = false;
        if (btnMode === 'eq') {
          isActive = currentMode === 'eq';
        } else if (btnMode === 'ge') {
          isActive = currentMode === 'ge' || currentMode === 'between';
        } else if (btnMode === 'le') {
          isActive = currentMode === 'le' || currentMode === 'between';
        }
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    };

    const updateTargetSummaryValue = () => {
      if (!attrName) {
        return;
      }
      const summaryEl = targetSummaryMap.get(attrName);
      if (!summaryEl) {
        return;
      }
      const { eq, ge, le } = getModeFlags();
      let summaryText = '';
      if (eq) {
        const value = sliderSingleValueEl ? sliderSingleValueEl.textContent.trim() : formatSliderValue(storedValues.eq);
        summaryText = value || formatSliderValue(storedValues.eq);
      } else if (!eq && ge && le) {
        const minValue = sliderMinValueEl ? sliderMinValueEl.textContent.trim() : formatSliderValue(storedValues.ge);
        const maxValue = sliderMaxValueEl ? sliderMaxValueEl.textContent.trim() : formatSliderValue(storedValues.le);
        summaryText = `${minValue} – ${maxValue}`;
      } else if (ge) {
        const minValue = sliderMinValueEl ? sliderMinValueEl.textContent.trim() : formatSliderValue(storedValues.ge);
        summaryText = `≥ ${minValue}`;
      } else if (le) {
        const maxValue = sliderMaxValueEl ? sliderMaxValueEl.textContent.trim() : formatSliderValue(storedValues.le);
        summaryText = `≤ ${maxValue}`;
      } else {
        const value = sliderSingleValueEl ? sliderSingleValueEl.textContent.trim() : formatSliderValue(storedValues.eq);
        summaryText = value || formatSliderValue(storedValues.eq);
      }
      summaryEl.textContent = summaryText || '–';
    };

    const updateSliderDisplay = () => {
      const { eq, ge, le } = getModeFlags();
      const showRange = !eq && ge && le;
      if (sliderRangeContainer) {
        sliderRangeContainer.hidden = !showRange;
      }
      if (sliderSingleContainer) {
        sliderSingleContainer.hidden = showRange;
      }
      if (showRange) {
        sliderRangeContainer.classList.add('slider-value-range');
        if (sliderMinValueEl) {
          sliderMinValueEl.textContent = formatSliderValue(clampSliderValue(storedValues.ge));
        }
        if (sliderMaxValueEl) {
          sliderMaxValueEl.textContent = formatSliderValue(clampSliderValue(storedValues.le));
        }
      } else if (sliderSingleValueEl) {
        sliderRangeContainer.classList.remove('slider-value-range');
        let displayValue;
        if (eq) {
          displayValue = storedValues.eq;
        } else if (ge) {
          displayValue = storedValues.ge;
        } else if (le) {
          displayValue = storedValues.le;
        } else {
          displayValue = storedValues.eq;
        }
        sliderSingleValueEl.textContent = formatSliderValue(clampSliderValue(displayValue));
      } else {
        sliderRangeContainer.classList.remove('slider-value-range');
      }
      updateTargetSummaryValue();
    };

    const syncHiddenValues = () => {
      if (currentMode === 'ge') {
        minInput.value = formatSliderValue(clampSliderValue(storedValues.ge));
        maxInput.value = '';
      } else if (currentMode === 'le') {
        minInput.value = '';
        maxInput.value = formatSliderValue(clampSliderValue(storedValues.le));
      } else if (currentMode === 'eq') {
        const formatted = formatSliderValue(clampSliderValue(storedValues.eq));
        minInput.value = formatted;
        maxInput.value = formatted;
      } else if (currentMode === 'between') {
        minInput.value = formatSliderValue(clampSliderValue(storedValues.ge));
        maxInput.value = formatSliderValue(clampSliderValue(storedValues.le));
      } else {
        minInput.value = '';
        maxInput.value = '';
      }
    };

    const syncSliderHandles = () => {
      const { eq, ge, le } = getModeFlags();
      const showRange = !eq && ge && le;
      if (eq) {
        const value = clampSliderValue(storedValues.eq);
        storedValues.eq = value;
        storedValues.ge = value;
        storedValues.le = value;
        setHandleState(sliderMinHandle, { visible: true, role: 'eq', value, zIndex: 3 });
        setHandleState(sliderMaxHandle, { visible: false, role: 'le', value, zIndex: 2 });
      } else if (showRange) {
        const minValue = clampSliderValue(storedValues.ge);
        const maxValue = clampSliderValue(Math.max(storedValues.le, minValue));
        storedValues.ge = minValue;
        storedValues.le = maxValue;
        setHandleState(sliderMinHandle, { visible: true, role: 'ge', value: minValue, zIndex: 2 });
        setHandleState(sliderMaxHandle, { visible: true, role: 'le', value: maxValue, zIndex: 3 });
      } else if (ge) {
        const value = clampSliderValue(storedValues.ge);
        storedValues.ge = value;
        storedValues.le = Math.max(storedValues.le, value);
        setHandleState(sliderMinHandle, { visible: true, role: 'ge', value, zIndex: 3 });
        setHandleState(sliderMaxHandle, { visible: false, role: 'le', value, zIndex: 2 });
      } else if (le) {
        const value = clampSliderValue(storedValues.le);
        storedValues.le = value;
        storedValues.ge = Math.min(storedValues.ge, value);
        setHandleState(sliderMinHandle, { visible: false, role: 'ge', value, zIndex: 2 });
        setHandleState(sliderMaxHandle, { visible: true, role: 'le', value, zIndex: 3 });
      } else {
        const value = clampSliderValue(storedValues.eq);
        storedValues.eq = value;
        storedValues.ge = value;
        storedValues.le = value;
        setHandleState(sliderMinHandle, { visible: true, role: 'eq', value, zIndex: 3 });
        setHandleState(sliderMaxHandle, { visible: false, role: 'le', value, zIndex: 2 });
      }
      updateSliderDisplay();
    };

    const setSliderDisabled = (disabled) => {
      if (sliderController) {
        sliderController.setDisabled(disabled);
        sliderController.refresh();
      } else {
        sliderHandles.forEach((handle) => {
          if (handle) {
            handle.disabled = !!disabled;
          }
        });
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

    const setModeValue = (nextMode) => {
      let sanitized = sanitizeModeValue(nextMode);
      if (sanitized === 'between' && (!sliderMinHandle || !sliderMaxHandle)) {
        sanitized = sliderMinHandle ? 'ge' : sliderMaxHandle ? 'le' : 'any';
      }
      currentMode = sanitized;
      modeInput.value = sanitized;
      if (sanitized === 'eq') {
        const base = clampSliderValue(storedValues.ge);
        storedValues.eq = clampSliderValue(storedValues.eq);
        storedValues.ge = clampSliderValue(storedValues.ge ?? base);
        storedValues.le = storedValues.ge;
        storedValues.eq = storedValues.ge;
      } else if (sanitized === 'ge') {
        storedValues.ge = clampSliderValue(storedValues.ge);
      } else if (sanitized === 'le') {
        storedValues.le = clampSliderValue(storedValues.le);
      } else if (sanitized === 'between') {
        storedValues.ge = clampSliderValue(storedValues.ge);
        storedValues.le = clampSliderValue(storedValues.le);
        if (storedValues.le < storedValues.ge) {
          storedValues.le = storedValues.ge;
        }
      }
      if (sanitized !== 'any') {
        savedNumericMode = sanitized;
      }
      setModeButtonsState();
      syncSliderHandles();
      syncHiddenValues();
      updateSliderDisplay();
      updateSubmitState();
      syncClearButtonState();
    };

    const handleSliderInput = (handleEl, roleHint) => {
      if (!handleEl) return;
      const role = roleHint || handleEl.dataset.handleRole || 'eq';
      let value = 0;
      if (sliderController) {
        const key = sliderController.getHandleKey(handleEl);
        value = clampSliderValue(key ? sliderController.getValue(key) : 0);
      } else {
        value = clampSliderValue(sliderStepToNumber(handleEl.value));
      }
      if (role === 'ge') {
        storedValues.ge = value;
        if (currentMode === 'eq') {
          storedValues.eq = value;
          storedValues.le = value;
          if (sliderMaxHandle) {
            isUpdatingHandles = true;
            setSliderHandleValue(sliderMaxHandle, value);
            isUpdatingHandles = false;
          }
        } else if (currentMode === 'between' && storedValues.le < value) {
          storedValues.le = value;
          if (sliderMaxHandle) {
            isUpdatingHandles = true;
            setSliderHandleValue(sliderMaxHandle, value);
            isUpdatingHandles = false;
          }
        }
      } else if (role === 'le') {
        storedValues.le = value;
        if (currentMode === 'between' && storedValues.ge > value) {
          storedValues.ge = value;
          if (sliderMinHandle) {
            isUpdatingHandles = true;
            setSliderHandleValue(sliderMinHandle, value);
            isUpdatingHandles = false;
          }
        }
      } else {
        storedValues.eq = value;
        storedValues.ge = value;
        storedValues.le = value;
        if (sliderMaxHandle) {
          isUpdatingHandles = true;
          setSliderHandleValue(sliderMaxHandle, value);
          isUpdatingHandles = false;
        }
      }
      setSliderHandleValue(handleEl, value);
      syncHiddenValues();
      updateSliderDisplay();
      updateSubmitState();
      syncClearButtonState();
    };

    const toggleEq = () => {
      if (currentMode === 'eq') {
        setModeValue('any');
      } else {
        setModeValue('eq');
      }
    };

    const toggleGe = () => {
      if (currentMode === 'ge') {
        setModeValue('any');
      } else if (currentMode === 'between') {
        setModeValue('le');
      } else if (currentMode === 'le') {
        setModeValue('between');
      } else {
        setModeValue('ge');
      }
    };

    const toggleLe = () => {
      if (currentMode === 'le') {
        setModeValue('any');
      } else if (currentMode === 'between') {
        setModeValue('ge');
      } else if (currentMode === 'ge') {
        setModeValue('between');
      } else {
        setModeValue('le');
      }
    };

    const clearAttributeConstraints = () => {
      savedNumericMode = null;
      currentMode = 'any';
      modeInput.value = 'any';
      storedValues.eq = fallbackValue;
      storedValues.ge = fallbackValue;
      storedValues.le = fallbackValue;
      syncSliderHandles();
      syncHiddenValues();
      updateSliderDisplay();
      applyColorSelection(null, { focus: false });
      updateSubmitState();
      syncClearButtonState();
    };

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearAttributeConstraints();
      });
    }

    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (sliderHandles.length && sliderHandles.every((handle) => handle && handle.disabled)) {
          return;
        }
        const targetMode = btn.dataset.mode || 'eq';
        if (targetMode === 'eq') {
          toggleEq();
        } else if (targetMode === 'ge') {
          toggleGe();
        } else if (targetMode === 'le') {
          toggleLe();
        }
      });
    });

    if (sliderMinHandle) {
      sliderMinHandle.addEventListener('input', () => {
        if (isUpdatingHandles || sliderMinHandle.disabled) {
          return;
        }
        handleSliderInput(sliderMinHandle, sliderMinHandle.dataset.handleRole || 'ge');
      });
      sliderMinHandle.addEventListener('change', () => {
        syncHiddenValues();
      });
    }

    if (sliderMaxHandle) {
      sliderMaxHandle.addEventListener('input', () => {
        if (isUpdatingHandles || sliderMaxHandle.disabled) {
          return;
        }
        handleSliderInput(sliderMaxHandle, sliderMaxHandle.dataset.handleRole || 'le');
      });
      sliderMaxHandle.addEventListener('change', () => {
        syncHiddenValues();
      });
    }

    const getSelectedColor = () => {
      const selected = colorRadios.find((radio) => radio.checked) || null;
      return selected ? selected.value : null;
    };

    const controller = {
      getState: () => ({
        color: getSelectedColor(),
        mode: modeInput.value,
        values: {
          eq: storedValues.eq,
          ge: storedValues.ge,
          le: storedValues.le,
        },
      }),
      applyState: (state) => {
        if (!state || typeof state !== 'object') {
          return;
        }
        const { color = null, mode = 'any', values = {} } = state;
        applyColorSelection(color, { focus: false });
        if (!color) {
          if (Number.isFinite(values.eq)) {
            storedValues.eq = clampSliderValue(values.eq);
          }
          if (Number.isFinite(values.ge)) {
            storedValues.ge = clampSliderValue(values.ge);
          }
          if (Number.isFinite(values.le)) {
            storedValues.le = clampSliderValue(values.le);
          }
          setModeValue(mode || 'any');
        } else if (mode && mode !== 'any') {
          savedNumericMode = mode;
        }
        syncCardSliderHighlight(color);
        syncColorChipVisuals();
        syncClearButtonState();
      },
      setColor: (value) => {
        applyColorSelection(value, { focus: false });
      },
    };

    if (attrName) {
      attrControllers.set(attrName, controller);
    }

    if (copyBtn && attrName) {
      copyBtn.addEventListener('click', () => {
        const state = controller.getState();
        attrControllers.forEach((target, key) => {
          if (key === attrName) {
            return;
          }
          target.applyState(state);
        });
      });
    }

    updateColorState = () => {
      const selected = colorRadios.find((radio) => radio.checked) || null;
      syncColorChipVisuals();
      syncCardSliderHighlight(selected ? selected.value : null);
      const isColorActive = !!selected;
      if (isColorActive) {
        if (currentMode !== 'any') {
          savedNumericMode = currentMode;
        }
        currentMode = 'any';
        modeInput.value = 'any';
        setSliderDisabled(true);
        minInput.value = '';
        maxInput.value = '';
        syncSliderHandles();
        updateSliderDisplay();
      } else {
        setSliderDisabled(false);
        const restoreMode = savedNumericMode || 'any';
        setModeValue(restoreMode);
      }
      updateSubmitState();
      syncClearButtonState();
    };

    syncSliderHandles();
    syncHiddenValues();
    setModeButtonsState();
    updateColorState();
    colorStateUpdaters.push(updateColorState);
  });

  const containerToTypes = new Map();
  colorEventContainers.forEach((container, type) => {
    if (!container) {
      return;
    }
    if (!containerToTypes.has(container)) {
      containerToTypes.set(container, new Set());
    }
    containerToTypes.get(container).add(type);
  });

  containerToTypes.forEach((types, container) => {
    const handlerMaps = Array.from(types)
      .map((type) => colorCardEventHandlersByType.get(type))
      .filter((map) => map && map.size > 0);
    if (!handlerMaps.length) {
      return;
    }
    [pointerDownEvent, 'click', 'keydown', 'change'].forEach((eventType) => {
      container.addEventListener(eventType, (event) => {
        const group = event.target.closest('[data-color-group]');
        if (!group) {
          return;
        }
        const card = group.closest('[data-attr-card]');
        if (!card) {
          return;
        }
        for (const handlerMap of handlerMaps) {
          const handler = handlerMap.get(card);
          if (handler) {
            handler(event);
            break;
          }
        }
      });
    });
  });

  if (setAllGreenBtn) {
    const labelSpan = setAllGreenBtn.querySelector('[data-set-all-green-label]');
    const initialLabel = labelSpan ? labelSpan.textContent : '';
    const greenLabel = setAllGreenBtn.dataset.labelGreen || initialLabel;
    const anyLabel = setAllGreenBtn.dataset.labelAny || initialLabel;

    const setButtonMode = (mode) => {
      setAllGreenBtn.dataset.mode = mode;
      setAllGreenBtn.setAttribute('aria-pressed', mode === 'any' ? 'true' : 'false');
      if (!labelSpan) return;
      labelSpan.textContent = mode === 'green' ? greenLabel : anyLabel;
    };

    setButtonMode('green');

    const syncSetAllGreenState = () => {
      const allGreen = attrCards.every((card) => {
        const selected = card.querySelector('input[type="radio"][data-color-radio]:checked');
        return selected && selected.value === 'green';
      });
      setButtonMode(allGreen ? 'any' : 'green');
    };

    allGreenWatcher = syncSetAllGreenState;
    syncSetAllGreenState();

    setAllGreenBtn.addEventListener('click', () => {
      const currentMode = setAllGreenBtn.dataset.mode === 'any' ? 'any' : 'green';
      const targetColor = currentMode === 'green' ? 'green' : null;

      attrControllers.forEach((controller) => {
        if (!controller || typeof controller.setColor !== 'function') {
          return;
        }
        controller.setColor(targetColor);
      });

      colorStateUpdaters.forEach((fn) => fn());
      if (typeof allGreenWatcher === 'function') {
        allGreenWatcher();
      }
      updateSubmitState();

      setButtonMode(currentMode === 'green' ? 'any' : 'green');
    });
  }

  if (optionalToggleBtn) {
    optionalToggleBtn.addEventListener('click', () => {
      const enabledCheckboxes = getEnabledOptionalCheckboxes();
      if (!enabledCheckboxes.length) {
        return;
      }
      const shouldSelectAll = enabledCheckboxes.some((checkbox) => !checkbox.checked);
      enabledCheckboxes.forEach((checkbox) => {
        checkbox.checked = shouldSelectAll;
        checkbox.dataset.userOptional = shouldSelectAll ? 'true' : 'false';
      });
      updateOptionalToggleState();
      refreshMixSummary();
    });
  }

  if (detailsToggleBtn && ingredientsWrapper) {
    const labelSpan = detailsToggleBtn.querySelector('[data-toggle-details-label]');
    const initialLabel = labelSpan ? labelSpan.textContent : '';
    const showLabel = detailsToggleBtn.dataset.labelShow || initialLabel;
    const hideLabel = detailsToggleBtn.dataset.labelHide || initialLabel;

    const applyDetailsState = (hidden) => {
      const nextState = hidden ? 'true' : 'false';
      ingredientsWrapper.dataset.hideAttributes = nextState;
      if (labelSpan) {
        labelSpan.textContent = hidden ? showLabel : hideLabel;
      }
      detailsToggleBtn.dataset.state = hidden ? 'hidden' : 'shown';
      detailsToggleBtn.setAttribute('aria-pressed', hidden ? 'false' : 'true');
    };

    const initialHidden = ingredientsWrapper.dataset.hideAttributes !== 'false';
    applyDetailsState(initialHidden);

    detailsToggleBtn.addEventListener('click', () => {
      const isHidden = ingredientsWrapper.dataset.hideAttributes !== 'false';
      applyDetailsState(!isHidden);
    });
  }

  if (ingredientsWrapper) {
    ingredientsWrapper.addEventListener('change', (event) => {
      const target = event.target;
      if (!target || target.type !== 'checkbox') {
        return;
      }
      if (target.matches('input[type="checkbox"][name="selected_ingredients"]')) {
        target.dataset.userSelected = target.checked ? 'true' : 'false';
      } else if (target.matches('input[type="checkbox"][name="optional_ingredients"]')) {
        target.dataset.userOptional = target.checked ? 'true' : 'false';
        updateOptionalToggleState();
      }
      refreshMixSummary();
    });

  }

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
    updateSliderTracksForStyle(styleName);
    const styleEntry = styleName ? stylesData[styleName] : null;
    const styleBands = styleEntry && styleEntry.bands ? styleEntry.bands : {};
    updateStyleGhosts(styleBands);
    if (!styleName) {
      updateOptionalToggleState();
      return;
    }
    const activeMins = styleMinMap[styleName] || {};

    ingredientRows.forEach((row) => {
      const ingredientId = row.dataset.ingredientId;
      const includeCheckbox = row.querySelector('input[type="checkbox"][name="selected_ingredients"]');
      const optionalCheckbox = row.querySelector('input[type="checkbox"][name="optional_ingredients"]');
      const label = row.querySelector('.ingredient-toggle--include');
      const badge = row.querySelector('[data-required-badge]');
      if (!includeCheckbox || !ingredientId) {
        return;
      }
      const requiredCount = activeMins[ingredientId] || 0;
      if (requiredCount > 0) {
        row.classList.add('ingredient-locked');
        includeCheckbox.checked = true;
        includeCheckbox.disabled = true;
        includeCheckbox.dataset.userSelected = 'false';
        if (optionalCheckbox) {
          optionalCheckbox.checked = false;
          optionalCheckbox.disabled = true;
        }
        if (label && requiredTooltip) {
          label.title = requiredTooltip;
        }
        if (badge) {
          badge.hidden = false;
          badge.textContent = formatRequiredBadge(requiredCount);
        }
      } else {
        row.classList.remove('ingredient-locked');
        includeCheckbox.disabled = false;
        const userSelected = includeCheckbox.dataset.userSelected === 'true';
        includeCheckbox.checked = userSelected;
        if (optionalCheckbox) {
          optionalCheckbox.disabled = false;
          const userOptional = optionalCheckbox.dataset.userOptional === 'true';
          optionalCheckbox.checked = userOptional;
        }
        if (label) {
          label.removeAttribute('title');
        }
        if (badge) {
          badge.hidden = true;
          badge.textContent = requiredSingle;
        }
      }
    });
    updateOptionalToggleState();
    refreshMixSummary();
  };

  if (styleSelect) {
    styleSelect.addEventListener('change', () => {
      applyStyleRequirements(styleSelect.value);
    });
    applyStyleRequirements(styleSelect.value);
  }

  updateSubmitState();
  updateOptionalToggleState();
  if (!styleSelect) {
    refreshMixSummary();
  }

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

  const MAX_RESULT_DISPLAY_VALUE = 10.90;

  const formatResultValue = (value) => {
    if (!Number.isFinite(value)) {
      return '0';
    }
    const safeValue = Math.min(Math.max(0, value), MAX_RESULT_DISPLAY_VALUE);
    const rounded = Math.round(safeValue * 10) / 10;
    if (safeValue >= MAX_RESULT_DISPLAY_VALUE - 1e-6) {
      return MAX_RESULT_DISPLAY_VALUE.toFixed(1);
    }
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

  const sortSolutionsForDisplay = (solutions) => {
    if (!Array.isArray(solutions)) return [];
    const attrIndex = ATTRS.length > 0 ? 0 : -1;

    const sorted = [...solutions];
    sorted.sort((a, b) => {
      const costA = numericValue((a && a.totalCost) || (a && a.averageCost));
      const costB = numericValue((b && b.totalCost) || (b && b.averageCost));
      const costDiff = costA - costB;
      if (Math.abs(costDiff) > EPS) {
        return costDiff;
      }

      const totalsA = Array.isArray(a.totals) ? a.totals : [];
      const totalsB = Array.isArray(b.totals) ? b.totals : [];

      if (attrIndex >= 0) {
        const aVal = numericValue(totalsA[attrIndex]);
        const bVal = numericValue(totalsB[attrIndex]);
        const primaryDiff = aVal - bVal;
        if (Math.abs(primaryDiff) > EPS) {
          return -primaryDiff;
        }
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

      const unitsA = Number.isFinite(a.totalUnits) ? a.totalUnits : numericValue(a.sum);
      const unitsB = Number.isFinite(b.totalUnits) ? b.totalUnits : numericValue(b.sum);
      if (Math.abs(unitsA - unitsB) > EPS) {
        return unitsA - unitsB;
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

  const renderState = (partialState = {}) => {
    const nextState = {
      ...resultsState,
      ...partialState,
    };

    resultsState = nextState;

    const sortedSolutions = Array.isArray(nextState.solutions)
      ? sortSolutionsForDisplay(nextState.solutions)
      : nextState.solutions;

    const rendered = renderResults(
      {
        ...nextState,
        solutions: sortedSolutions,
      },
      {
        selectors,
        translate,
        attrLabels,
        bandLabels,
        ATTRS,
        displayIngredientName,
        sanitizeBand,
        formatResultValue,
        clamp,
        seasonOrder: SEASON_ORDER,
        seasonLabels,
        formatCost,
      },
    );

    const cards = rendered && Array.isArray(rendered.cards) ? rendered.cards : [];
    if (resultsList) {
      if (typeof resultsList.replaceChildren === 'function') {
        resultsList.replaceChildren(...cards);
      } else {
        resultsList.innerHTML = '';
        cards.forEach((card) => {
          if (card && typeof card === 'object' && typeof card.nodeType === 'number') {
            resultsList.appendChild(card);
          }
        });
      }
    }
  };

  renderState();

  const renderSolutions = (solutions, summaryLines, infoMessages) => {
    renderState({
      loading: false,
      solutions: Array.isArray(solutions) ? [...solutions] : [],
      summary: Array.isArray(summaryLines) ? [...summaryLines] : [],
      info: Array.isArray(infoMessages) ? [...infoMessages] : [],
    });
  };

  const setLoadingState = (loading) => {
    const next = Boolean(loading);
    if (resultsState.loading === next) {
      return;
    }
    renderState({ loading: next });
  };

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      setLoadingState(true);

      window.requestAnimationFrame(() => {
        const debugLines = [];
        try {
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
            } else if (mode === 'between') {
              const loVal = minVal === null ? 0 : minVal;
              const hiVal = maxVal === null ? 11 : Math.max(loVal, maxVal);
              lo = loVal;
              hi = hiVal;
              debugLo = loVal;
              debugHi = hiVal;
            } else {
              debugLo = 0;
              debugHi = 11;
            }

            numericIntervals[attr] = [lo, hi];
            debugIntervals[attr] = [debugLo, debugHi];
          });

          const selectedRequired = new Set(formData.getAll('selected_ingredients'));
          const optionalPool = new Set(formData.getAll('optional_ingredients'));
          const extraMinCounts = {};
          selectedRequired.forEach((id) => {
            extraMinCounts[id] = Math.max(extraMinCounts[id] || 0, 1);
          });

          const allowedSet = new Set(optionalPool);
          selectedRequired.forEach((id) => allowedSet.add(id));

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
          if (selectedRequired.size) {
            const requiredList = Array.from(selectedRequired)
              .map((id) => displayIngredientName(id))
              .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            debugLines.push(translate('debug_required', { list: requiredList.join(', ') }));
          }
          if (optionalPool.size) {
            const optionalList = Array.from(optionalPool)
              .map((id) => displayIngredientName(id))
              .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            debugLines.push(translate('debug_optional', { list: optionalList.join(', ') }));
          }

          const workerRequest = {
            styleName,
            numericIntervals,
            bandPreferences,
            totalCap,
            perCap,
            extraMinCounts,
            allowedIngredientIds: Array.from(allowedSet),
            topK: DEFAULT_TOP_K,
          };

          const summaryLines = [];
          if (styleName) {
            summaryLines.push(translate('summary_style', { style: displayStyleName(styleName) }));
          }
          summaryLines.push(translate('summary_caps', { total: totalCap, per: perCap }));

          const solvePromise = workerController
            ? workerController.solve(workerRequest).catch((error) => {
              console.warn('Solver worker solve failed; falling back to main thread', error);
              if (workerController) {
                workerController.terminate();
                workerController = null;
              }
              return runSolveOnMainThread({
                ...workerRequest,
                allowedIngredientIds: allowedSet,
              });
            })
            : Promise.resolve(
              runSolveOnMainThread({
                ...workerRequest,
                allowedIngredientIds: allowedSet,
              }),
            );

          solvePromise
            .then(({ solutions, info }) => {
              renderSolutions(solutions, summaryLines, info);
              renderDebug(debugLines);
            })
            .catch((error) => {
              console.error('Recipe calculation failed', error);
              renderSolutions([], [], [translate('solver_failed')]);
              renderDebug(debugLines);
            })
            .finally(() => {
              setLoadingState(false);
            });
          return;
        } catch (error) {
          console.error('Recipe calculation failed', error);
          renderSolutions([], [], [translate('solver_failed')]);
          renderDebug(debugLines);
          setLoadingState(false);
          return;
        }
      });
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSolver);
} else {
  initSolver();
}
