let cachedContext = null;

const createBandPill = (attr, band, dictionaries = {}) => {
  const {
    sanitizeBand = (value) => value,
    attrLabels = {},
    bandLabels = {},
  } = dictionaries;

  const sanitized = sanitizeBand(band);
  const pill = document.createElement('span');
  pill.className = `pill ${sanitized}`;

  const label = attrLabels[attr] || attr;
  const bandLabel = bandLabels[band] || band || 'n/a';
  pill.textContent = `${label}: ${bandLabel}`;

  return pill;
};

const createAttributeBar = (attr, value, band, scaleMax, dictionaries = {}) => {
  const {
    attrLabels = {},
    bandLabels = {},
    formatResultValue = (val) => String(val),
    sanitizeBand = (val) => val,
    clamp = (val) => val,
  } = dictionaries;

  const label = attrLabels[attr] || attr;
  const bandLabel = bandLabels[band] || band || 'n/a';
  const sanitized = sanitizeBand(band);

  const bar = document.createElement('div');
  bar.className = 'result-attr-bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute(
    'aria-label',
    `${label}: ${formatResultValue(value)} (${bandLabel})`,
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
  fill.title = `${label}: ${formatResultValue(value)}`;

  track.appendChild(fill);
  bar.appendChild(track);

  const nameLabel = document.createElement('span');
  nameLabel.className = 'result-attr-name';
  nameLabel.textContent = label;
  bar.appendChild(nameLabel);

  return bar;
};

export const renderResultCard = (solution, dictionaries = {}) => {
  const {
    translate = (key) => key,
    displayIngredientName = (value) => value,
    displayStyleName = (value) => value,
    ATTRS = [],
    formatCost = (value) => String(value),
    seasonOrder = [],
    seasonLabels = {},
    getCurrentStyleId = () => null,
    getStyleRequirements = () => ({}),
    styleMinMap = {},
    selectionMeta = {},
  } = dictionaries;

  const index = typeof dictionaries.index === 'number' ? dictionaries.index : 0;

  const resolveStyleId = () => {
    if (typeof dictionaries.currentStyleId === 'string' && dictionaries.currentStyleId) {
      return dictionaries.currentStyleId;
    }
    if (typeof getCurrentStyleId === 'function') {
      try {
        return getCurrentStyleId() || null;
      } catch (error) {
        return null;
      }
    }
    return null;
  };

  const activeStyleId = resolveStyleId();

  const resolveRequirements = (styleId) => {
    if (!styleId) {
      return {};
    }
    if (typeof getStyleRequirements === 'function') {
      try {
        const requirements = getStyleRequirements(styleId);
        if (requirements && typeof requirements === 'object') {
          return requirements;
        }
      } catch (error) {
        // fall through to styleMinMap fallback
      }
    }
    if (styleMinMap && typeof styleMinMap === 'object' && styleMinMap[styleId]) {
      return styleMinMap[styleId];
    }
    return {};
  };

  const card = document.createElement('article');
  card.className = 'card result-card';

  const body = document.createElement('div');
  body.className = 'result-card-body';
  const bodyId = `result-card-body-${Math.random().toString(36).slice(2, 10)}`;
  body.id = bodyId;

  const header = document.createElement('div');
  header.className = 'result-card-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'result-card-title-row';

  const styleNameRaw = typeof displayStyleName === 'function'
    ? displayStyleName(activeStyleId)
    : activeStyleId;
  const styleName = typeof styleNameRaw === 'string' ? styleNameRaw.trim() : '';
  if (styleName) {
    const styleEl = document.createElement('p');
    styleEl.className = 'result-card-style';
    styleEl.textContent = styleName;
    titleRow.appendChild(styleEl);
  }

  const heading = document.createElement('h3');
  const totalCost = Number.isFinite(solution && solution.totalCost)
    ? solution.totalCost
    : Number.isFinite(solution && solution.averageCost)
      ? solution.averageCost
      : 0;
  heading.textContent = translate('solutions_cost_heading', { value: formatCost(totalCost) });
  titleRow.appendChild(heading);

  const totalUnits = Number.isFinite(solution && solution.totalUnits)
    ? solution.totalUnits
    : Number.isFinite(solution && solution.sum)
      ? solution.sum
      : 0;
  const subtitle = document.createElement('span');
  subtitle.className = 'result-card-subtitle';
  subtitle.textContent = translate('solutions_total', { count: totalUnits });
  titleRow.appendChild(subtitle);

  const bandContainer = document.createElement('div');
  bandContainer.className = 'result-band-pills result-band-pills--inline';

  const metaRow = document.createElement('div');
  metaRow.className = 'result-card-meta';

  const badgeGroup = document.createElement('div');
  badgeGroup.className = 'result-card-badges';
  metaRow.appendChild(badgeGroup);
  metaRow.appendChild(bandContainer);

  titleRow.appendChild(metaRow);

  header.appendChild(titleRow);

  const actions = document.createElement('div');
  actions.className = 'result-card-actions';

  const rank = document.createElement('span');
  rank.className = 'result-card-rank';
  rank.textContent = `#${index + 1}`;
  actions.appendChild(rank);

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'result-card-toggle';
  toggleButton.setAttribute('aria-controls', bodyId);

  const resolveToggleLabel = (expanded) => {
    const keys = expanded
      ? ['button_details_hide', 'results_hide_details']
      : ['button_details_show', 'results_show_details'];
    for (const key of keys) {
      const value = translate(key);
      if (typeof value === 'string' && value.length && value !== key) {
        return value;
      }
    }
    return expanded ? 'Hide details' : 'Show details';
  };

  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'result-card-toggle-icon';
  toggleIcon.setAttribute('aria-hidden', 'true');
  toggleButton.appendChild(toggleIcon);

  const setExpandedState = (expanded) => {
    const next = Boolean(expanded);
    const label = resolveToggleLabel(next);
    toggleButton.setAttribute('aria-expanded', next ? 'true' : 'false');
    toggleButton.setAttribute('aria-label', label);
    toggleButton.title = label;
    card.dataset.expanded = next ? 'true' : 'false';
    toggleButton.dataset.iconState = next ? 'expanded' : 'collapsed';
    body.hidden = !next;
  };

  toggleButton.addEventListener('click', () => {
    const isExpanded = card.dataset.expanded === 'true';
    setExpandedState(!isExpanded);
  });

  actions.appendChild(toggleButton);
  header.appendChild(actions);

  card.appendChild(header);
  card.appendChild(body);

  const mixSection = document.createElement('div');
  mixSection.className = 'result-ingredients';

  const mixTitle = document.createElement('p');
  mixTitle.className = 'result-section-title';
  mixTitle.textContent = translate('results_mix_title');
  mixSection.appendChild(mixTitle);

  const chipsContainer = document.createElement('div');
  chipsContainer.className = 'chips result-ingredients__chips';

  const requirements = resolveRequirements(activeStyleId);
  const requiredIds = Object.entries(requirements || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([ingredientId]) => ingredientId);
  const requiredSet = new Set(requiredIds);
  const normalizeToSet = (value) => {
    if (value instanceof Set) {
      return value;
    }
    if (Array.isArray(value)) {
      return new Set(value);
    }
    if (value && typeof value === 'object') {
      return new Set(Object.keys(value));
    }
    return new Set();
  };

  const includeSet = normalizeToSet(selectionMeta.includes);
  const optionalSet = normalizeToSet(selectionMeta.optional);

  const requiredLabelRaw = translate('badge_required_single');
  const includeLabelRaw = translate('label_include');
  const optionalLabelRaw = translate('label_optional');

  const statusLabelMap = {
    required: typeof requiredLabelRaw === 'string' ? requiredLabelRaw : 'Required',
    include: typeof includeLabelRaw === 'string' ? includeLabelRaw : 'Included',
    optional: typeof optionalLabelRaw === 'string' ? optionalLabelRaw : 'Optional',
  };

  const countsById = solution && typeof solution.countsById === 'object'
    ? solution.countsById
    : {};
  Object.entries(countsById).forEach(([id, cnt]) => {
    const chip = document.createElement('span');
    chip.className = 'chip result-ingredients__chip';
    const ingredientName = displayIngredientName(id);
    const label = `${ingredientName} × ${cnt}`;
    chip.title = label;

    let status = 'include';
    if (requiredSet.has(id)) {
      status = 'required';
    } else if (optionalSet.has(id)) {
      status = 'optional';
    } else if (includeSet.size > 0 && includeSet.has(id)) {
      status = 'include';
    }

    chip.dataset.status = status;
    const statusText = statusLabelMap[status];
    if (typeof statusText === 'string' && statusText.length) {
      chip.setAttribute('data-status-label', statusText);
      chip.setAttribute('aria-label', `${label} (${statusText})`);
    } else {
      chip.setAttribute('aria-label', label);
    }

    const span = document.createElement('span');
    span.textContent = label;
    chip.appendChild(span);
    chipsContainer.appendChild(chip);
  });
  mixSection.appendChild(chipsContainer);
  body.appendChild(mixSection);

  const usedIngredientIds = Object.keys(countsById);
  const singleVariety = requiredSet.size > 0 && usedIngredientIds.length > 0
    && usedIngredientIds.every((ingredientId) => requiredSet.has(ingredientId));

  if (singleVariety) {
    const badge = document.createElement('span');
    badge.className = 'result-card-badge result-card-badge--single';
    const badgeLabel = translate('badge_single_variety');
    badge.textContent = typeof badgeLabel === 'string' ? badgeLabel : 'Single-variety';
    if (typeof badgeGroup.replaceChildren === 'function') {
      badgeGroup.replaceChildren(badge);
    } else {
      badgeGroup.innerHTML = '';
      badgeGroup.appendChild(badge);
    }
    badgeGroup.hidden = false;
  } else {
    if (typeof badgeGroup.replaceChildren === 'function') {
      badgeGroup.replaceChildren();
    } else {
      badgeGroup.innerHTML = '';
    }
    badgeGroup.hidden = true;
  }

  const baseCost = Number.isFinite(solution && solution.baseCost) ? solution.baseCost : null;
  const averageCost = Number.isFinite(solution && solution.averageCost)
    ? solution.averageCost
    : totalCost;
  const minCost = Number.isFinite(solution && solution.minCost) ? solution.minCost : averageCost;
  const maxCost = Number.isFinite(solution && solution.maxCost) ? solution.maxCost : averageCost;
  const seasonalCosts = solution && typeof solution.seasonalCosts === 'object' ? solution.seasonalCosts : {};

  if (
    baseCost !== null
    || Number.isFinite(averageCost)
    || Object.keys(seasonalCosts).length > 0
  ) {
    const costSection = document.createElement('div');
    costSection.className = 'result-cost';

    const costTitle = document.createElement('p');
    costTitle.className = 'result-section-title';
    costTitle.textContent = translate('results_cost_title');
    costSection.appendChild(costTitle);

    const summaryList = document.createElement('dl');
    summaryList.className = 'result-cost-summary';

    const appendSummaryItem = (labelKey, valueText) => {
      if (!valueText) return;
      const label = translate(labelKey);
      const dt = document.createElement('dt');
      dt.textContent = typeof label === 'string' ? label : labelKey;
      const dd = document.createElement('dd');
      dd.textContent = valueText;
      summaryList.appendChild(dt);
      summaryList.appendChild(dd);
    };

    // if (baseCost !== null) {
    //   appendSummaryItem('results_cost_base', formatCost(baseCost));
    // }
    if (Number.isFinite(averageCost)) {
      appendSummaryItem('results_cost_average', formatCost(averageCost));
    }
    if (Number.isFinite(minCost) && Number.isFinite(maxCost)) {
      appendSummaryItem('results_cost_range', `${formatCost(minCost)} – ${formatCost(maxCost)}`);
    }

    if (summaryList.childElementCount > 0) {
      costSection.appendChild(summaryList);
    }

    const orderedSeasons = Array.isArray(seasonOrder) && seasonOrder.length
      ? seasonOrder
      : Object.keys(seasonalCosts);
    const seasonValues = orderedSeasons.map((season) => Number(seasonalCosts[season]));
    const hasSeasonData = seasonValues.some((val) => Number.isFinite(val));
    if (hasSeasonData) {
      const chartTitle = document.createElement('p');
      chartTitle.className = 'result-cost-chart-title';
      chartTitle.textContent = translate('results_cost_chart');
      costSection.appendChild(chartTitle);

      const chart = document.createElement('div');
      chart.className = 'result-cost-chart';
      const chartLabel = translate('results_cost_chart');
      if (typeof chartLabel === 'string') {
        chart.setAttribute('role', 'img');
        chart.setAttribute('aria-label', chartLabel);
      }

      const maxValue = seasonValues.reduce((acc, val) => {
        if (!Number.isFinite(val)) {
          return acc;
        }
        return Math.max(acc, val);
      }, 0);
      const denominator = maxValue > 0 ? maxValue : 1;

      orderedSeasons.forEach((season) => {
        const value = Number(seasonalCosts[season]);
        const column = document.createElement('div');
        column.className = 'result-cost-chart-column';

        const valueLabel = document.createElement('span');
        valueLabel.className = 'result-cost-chart-value';
        valueLabel.textContent = formatCost(value);
        column.appendChild(valueLabel);

        const barWrapper = document.createElement('div');
        barWrapper.className = 'result-cost-chart-bar-wrapper';
        const bar = document.createElement('div');
        bar.className = 'result-cost-chart-bar';
        const percent = Number.isFinite(value) ? Math.max(0, Math.min(1, value / denominator)) * 100 : 0;
        bar.style.height = `${percent}%`;
        const label = seasonLabels[season] || season;
        bar.title = `${label}: ${formatCost(value)}`;
        barWrapper.appendChild(bar);
        column.appendChild(barWrapper);

        const labelEl = document.createElement('span');
        labelEl.className = 'result-cost-chart-label';
        labelEl.textContent = label;
        column.appendChild(labelEl);

        chart.appendChild(column);
      });

      costSection.appendChild(chart);
    }

    if (summaryList.childElementCount > 0 || hasSeasonData) {
      body.appendChild(costSection);
    }
  }

  const attrTitle = document.createElement('p');
  attrTitle.className = 'result-section-title';
  attrTitle.textContent = translate('section_attributes');
  body.appendChild(attrTitle);

  const chart = document.createElement('div');
  chart.className = 'result-attr-chart';

  const totals = Array.isArray(solution && solution.totals) ? solution.totals : [];
  const scaleMax = Math.max(
    12,
    ...totals.map((value) => (Number.isFinite(value) ? value : 0)),
  );

  ATTRS.forEach((attr, idx) => {
    const rawValue = Number(totals[idx]);
    const value = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
    const band = solution && solution.bands ? solution.bands[attr] : null;
    const bar = createAttributeBar(attr, value, band, scaleMax, dictionaries);
    chart.appendChild(bar);
  });

  body.appendChild(chart);

  ATTRS.forEach((attr) => {
    const band = solution && solution.bands ? solution.bands[attr] : null;
    const pill = createBandPill(attr, band, dictionaries);
    bandContainer.appendChild(pill);
  });

  const defaultExpanded = index === 0;
  setExpandedState(defaultExpanded);

  return card;
};

export const renderResults = (state, dictionaries) => {
  cachedContext = dictionaries ? { ...dictionaries } : cachedContext;
  if (!cachedContext) {
    return { cards: [] };
  }

  const {
    selectors = {},
    translate = (key) => key,
    attrLabels = {},
    bandLabels = {},
    ATTRS = [],
    displayIngredientName = (value) => value,
    sanitizeBand = (value) => value,
    formatResultValue = (value) => String(value),
    clamp = (value) => value,
    formatCost = (value) => String(value),
    seasonOrder = [],
    seasonLabels = {},
  } = cachedContext;

  const {
    loading = false,
    solutions = null,
    info = [],
    selection = {},
    totalSolutions = 0,
  } = state || {};

  const {
    resultsSection,
    resultsTitle,
    resultsPlaceholder,
    resultsLoading,
    resultsEmpty,
    statusMessage,
    resultsHeader,
  } = selectors;

  if (!resultsSection) {
    return { cards: [] };
  }

  resultsSection.hidden = false;
  resultsSection.setAttribute('aria-busy', loading ? 'true' : 'false');

  if (resultsHeader) {
    resultsHeader.classList.toggle('is-loading', Boolean(loading));
    if (loading) {
      resultsHeader.classList.remove('is-ready');
    }
  }

  if (resultsLoading) {
    resultsLoading.hidden = !loading;
  }

  if (resultsTitle) {
    resultsTitle.textContent = translate('results_heading');
  }

  if (loading) {
    if (resultsPlaceholder) resultsPlaceholder.hidden = true;
    if (statusMessage) statusMessage.hidden = true;
    if (resultsEmpty) resultsEmpty.hidden = true;
    return { cards: [] };
  }

  const hasSolutions = Array.isArray(solutions);

  if (!hasSolutions) {
    if (resultsPlaceholder) resultsPlaceholder.hidden = false;
    if (statusMessage) {
      statusMessage.hidden = true;
      statusMessage.textContent = '';
    }
    if (resultsEmpty) resultsEmpty.hidden = true;
    if (resultsHeader) {
      resultsHeader.classList.remove('is-ready');
    }
    return { cards: [] };
  }

  if (resultsPlaceholder) {
    resultsPlaceholder.hidden = true;
  }

  if (resultsTitle) {
    const count = solutions.length;
    const normalizeNumber = (value, fallback) => {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : fallback;
    };
    const formatNumber = (value) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return '';
      }
      try {
        return numericValue.toLocaleString();
      } catch (error) {
        return String(numericValue);
      }
    };

    const displayedCount = normalizeNumber(count, 0);
    const totalCount = normalizeNumber(totalSolutions, displayedCount);
    const displayedFormatted = formatNumber(displayedCount);
    const totalFormatted = formatNumber(totalCount);

    const prefixRaw = translate('results_title_prefix', {
      displayed: displayedFormatted,
      total: totalFormatted,
    });
    const suffixKey = totalCount === 1
      ? 'results_title_suffix_single'
      : 'results_title_suffix';
    const suffixRaw = translate(suffixKey, {
      displayed: displayedFormatted,
      total: totalFormatted,
    });
    const prefixText = typeof prefixRaw === 'string' && prefixRaw !== 'results_title_prefix'
      ? prefixRaw
      : null;
    const suffixText = typeof suffixRaw === 'string' && suffixRaw !== suffixKey
      ? suffixRaw
      : null;

    if (!prefixText && !suffixText) {
      const fallbackRaw = translate('results_title', { count: displayedFormatted });
      const fallbackText = typeof fallbackRaw === 'string' && fallbackRaw !== 'results_title'
        ? fallbackRaw
        : translate('results_heading');
      resultsTitle.textContent = fallbackText;
    } else {
      resultsTitle.textContent = '';
      if (prefixText) {
        resultsTitle.append(document.createTextNode(prefixText));
        resultsTitle.append(document.createTextNode(' '));
      }
      const highlight = document.createElement('span');
      highlight.className = 'results-total-highlight';
      highlight.textContent = totalFormatted;
      resultsTitle.append(highlight);
      if (suffixText) {
        resultsTitle.append(document.createTextNode(` ${suffixText}`));
      }
    }

    if (resultsHeader) {
      resultsHeader.classList.toggle('is-ready', count > 0);
    }
  }

  if (statusMessage) {
    if (Array.isArray(info) && info.length > 0) {
      statusMessage.hidden = false;
      statusMessage.textContent = info.join(' ');
    } else {
      statusMessage.hidden = true;
      statusMessage.textContent = '';
    }
  }

  const list = solutions;
  const count = list.length;

  if (resultsEmpty) {
    resultsEmpty.hidden = count !== 0;
  }

  if (count === 0) {
    return { cards: [] };
  }

  const includesList = Array.isArray(selection.includes)
    ? selection.includes
    : [];
  const optionalList = Array.isArray(selection.optional)
    ? selection.optional
    : [];

  const selectionMeta = {
    includes: new Set(includesList),
    optional: new Set(optionalList),
  };

  const cards = list.map((solution, index) => renderResultCard(solution, {
    ...cachedContext,
    index,
    selectionMeta,
  }));

  return { cards };
};

export const renderDebug = (lines) => {
  if (!cachedContext) {
    return;
  }
  const { selectors = {} } = cachedContext;
  const { debugPanel, debugOutput } = selectors;
  if (!debugPanel || !debugOutput) {
    return;
  }
  if (!lines.length) {
    debugPanel.hidden = true;
    debugOutput.textContent = '';
    return;
  }
  debugPanel.hidden = false;
  debugOutput.textContent = lines.join('\n');
};
