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
    ATTRS = [],
    formatCost = (value) => String(value),
    seasonOrder = [],
    seasonLabels = {},
    getCurrentStyleId = () => null,
    getStyleRequirements = () => ({}),
    styleMinMap = {},
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

  const header = document.createElement('div');
  header.className = 'result-card-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'result-card-title-row';

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
  chipsContainer.className = 'chips result-ingredients__chips';
  const countsById = solution && typeof solution.countsById === 'object'
    ? solution.countsById
    : {};
  Object.entries(countsById).forEach(([id, cnt]) => {
    const chip = document.createElement('span');
    chip.className = 'chip result-ingredients__chip';
    const label = `${displayIngredientName(id)} × ${cnt}`;
    chip.title = label;
    const span = document.createElement('span');
    span.textContent = label;
    chip.appendChild(span);
    chipsContainer.appendChild(chip);
  });
  mixSection.appendChild(chipsContainer);
  card.appendChild(mixSection);

  const requirements = resolveRequirements(activeStyleId);
  const requiredIds = Object.entries(requirements || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([ingredientId]) => ingredientId);
  const requiredSet = new Set(requiredIds);
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
      card.appendChild(costSection);
    }
  }

  const attrTitle = document.createElement('p');
  attrTitle.className = 'result-section-title';
  attrTitle.textContent = translate('section_attributes');
  card.appendChild(attrTitle);

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

  card.appendChild(chart);

  ATTRS.forEach((attr) => {
    const band = solution && solution.bands ? solution.bands[attr] : null;
    const pill = createBandPill(attr, band, dictionaries);
    bandContainer.appendChild(pill);
  });

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
    summary = [],
    info = [],
  } = state || {};

  const {
    resultsSection,
    resultsTitle,
    resultsSummary,
    resultsPlaceholder,
    resultsLoading,
    resultsEmpty,
    statusMessage,
    resultsHeader,
  } = selectors;

  if (!resultsSection) {
    return { cards: [] };
  }

  const clearSummary = () => {
    if (!resultsSummary) {
      return;
    }
    resultsSummary.hidden = true;
    if (resultsSummary.dataset) {
      resultsSummary.dataset.visible = 'false';
    }
    if (typeof resultsSummary.replaceChildren === 'function') {
      resultsSummary.replaceChildren();
    } else {
      resultsSummary.innerHTML = '';
    }
  };

  const renderSummaryHighlights = (lines) => {
    if (!resultsSummary) {
      return;
    }
    const entries = Array.isArray(lines) ? lines.slice(0, 3) : [];
    if (!entries.length) {
      clearSummary();
      return;
    }

    const items = entries.map((line, index) => {
      const item = document.createElement('span');
      item.className = 'results-summary-item';
      item.textContent = line;
      item.style.setProperty('--item-index', index);
      return item;
    });

    resultsSummary.hidden = false;
    if (resultsSummary.dataset) {
      resultsSummary.dataset.visible = 'true';
    }
    if (typeof resultsSummary.replaceChildren === 'function') {
      resultsSummary.replaceChildren(...items);
    } else {
      resultsSummary.innerHTML = '';
      items.forEach((item) => resultsSummary.appendChild(item));
    }
  };

  const summaryLines = Array.isArray(summary) ? [...summary] : [];
  if (Array.isArray(solutions) && solutions.length > 0) {
    const topSolution = solutions[0] || {};
    const averageCost = Number.isFinite(topSolution && topSolution.averageCost)
      ? topSolution.averageCost
      : Number.isFinite(topSolution && topSolution.totalCost)
        ? topSolution.totalCost
        : null;
    if (Number.isFinite(averageCost)) {
      summaryLines.push(translate('summary_average_cost', { value: formatCost(averageCost) }));
    }
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
    clearSummary();
    if (statusMessage) statusMessage.hidden = true;
    if (resultsEmpty) resultsEmpty.hidden = true;
    return { cards: [] };
  }

  const hasSolutions = Array.isArray(solutions);

  if (!hasSolutions) {
    if (resultsPlaceholder) resultsPlaceholder.hidden = false;
    clearSummary();
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
    const titleText = translate('results_title', { count });
    resultsTitle.textContent = typeof titleText === 'string'
      ? titleText
      : translate('results_heading');
    if (resultsHeader) {
      resultsHeader.classList.toggle('is-ready', count > 0);
    }
  }

  renderSummaryHighlights(summaryLines);

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

  const cards = list.map((solution, index) => renderResultCard(solution, {
    ...cachedContext,
    index,
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
