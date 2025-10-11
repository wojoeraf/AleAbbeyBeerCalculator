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
  } = dictionaries;

  const index = typeof dictionaries.index === 'number' ? dictionaries.index : 0;

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
  const countsById = solution && typeof solution.countsById === 'object'
    ? solution.countsById
    : {};
  Object.entries(countsById).forEach(([id, cnt]) => {
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
    formatInteger = (value) => String(value),
    seasonOrder = [],
    seasonLabels = {},
  } = cachedContext;

  const {
    loading = false,
    solutions = null,
    summary = [],
    info = [],
    metrics = {},
  } = state || {};

  const {
    resultsSection,
    resultsTitle,
    resultsSummary,
    resultsPlaceholder,
    resultsLoading,
    resultsEmpty,
    statusMessage,
    resultsMetrics,
  } = selectors;

  if (!resultsSection) {
    return { cards: [] };
  }

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
    const minCost = Number.isFinite(topSolution && topSolution.minCost) ? topSolution.minCost : averageCost;
    const maxCost = Number.isFinite(topSolution && topSolution.maxCost) ? topSolution.maxCost : averageCost;
    if (Number.isFinite(minCost) && Number.isFinite(maxCost)) {
      summaryLines.push(
        translate('summary_cost_range', {
          min: formatCost(minCost),
          max: formatCost(maxCost),
        }),
      );
    }
    const seasonalCosts =
      topSolution && typeof topSolution.seasonalCosts === 'object' ? topSolution.seasonalCosts : {};
    const orderedSeasons = Array.isArray(seasonOrder) && seasonOrder.length
      ? seasonOrder
      : Object.keys(seasonalCosts);
    let cheapestSeason = null;
    let cheapestValue = Infinity;
    let priciestSeason = null;
    let priciestValue = -Infinity;
    orderedSeasons.forEach((season) => {
      const value = Number(seasonalCosts[season]);
      if (!Number.isFinite(value)) {
        return;
      }
      if (value < cheapestValue) {
        cheapestValue = value;
        cheapestSeason = season;
      }
      if (value > priciestValue) {
        priciestValue = value;
        priciestSeason = season;
      }
    });
    if (cheapestSeason) {
      const label = seasonLabels[cheapestSeason] || cheapestSeason;
      summaryLines.push(
        translate('summary_cheapest_season', {
          season: label,
          value: formatCost(cheapestValue),
        }),
      );
    }
    if (priciestSeason && priciestSeason !== cheapestSeason) {
      const label = seasonLabels[priciestSeason] || priciestSeason;
      summaryLines.push(
        translate('summary_most_expensive_season', {
          season: label,
          value: formatCost(priciestValue),
        }),
      );
    }
    const attrHint = translate('summary_attr_hint');
    if (typeof attrHint === 'string' && attrHint !== 'summary_attr_hint') {
      summaryLines.push(attrHint);
    }
  }

  resultsSection.hidden = false;
  resultsSection.setAttribute('aria-busy', loading ? 'true' : 'false');

  if (resultsLoading) {
    resultsLoading.hidden = !loading;
  }

  if (resultsTitle) {
    resultsTitle.textContent = translate('results_heading');
  }

  if (loading) {
    if (resultsPlaceholder) resultsPlaceholder.hidden = true;
    if (resultsSummary) resultsSummary.hidden = true;
    if (statusMessage) statusMessage.hidden = true;
    if (resultsEmpty) resultsEmpty.hidden = true;
    if (resultsMetrics) {
      resultsMetrics.hidden = true;
      if (typeof resultsMetrics.replaceChildren === 'function') {
        resultsMetrics.replaceChildren();
      } else {
        resultsMetrics.textContent = '';
      }
    }
    return { cards: [] };
  }

  const hasSolutions = Array.isArray(solutions);

  if (!hasSolutions) {
    if (resultsPlaceholder) resultsPlaceholder.hidden = false;
    if (resultsSummary) {
      resultsSummary.hidden = true;
      if (typeof resultsSummary.replaceChildren === 'function') {
        resultsSummary.replaceChildren();
      } else {
        resultsSummary.textContent = '';
      }
    }
    if (statusMessage) {
      statusMessage.hidden = true;
      statusMessage.textContent = '';
    }
    if (resultsEmpty) resultsEmpty.hidden = true;
    if (resultsMetrics) {
      resultsMetrics.hidden = true;
      if (typeof resultsMetrics.replaceChildren === 'function') {
        resultsMetrics.replaceChildren();
      } else {
        resultsMetrics.textContent = '';
      }
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
  }

  if (resultsSummary) {
    if (summaryLines.length) {
      resultsSummary.hidden = false;
      const summaryItems = summaryLines.map((line) => {
        const span = document.createElement('span');
        span.className = 'results-summary__item';
        span.textContent = line;
        return span;
      });
      if (typeof resultsSummary.replaceChildren === 'function') {
        resultsSummary.replaceChildren(...summaryItems);
      } else {
        resultsSummary.textContent = '';
        summaryItems.forEach((item, index) => {
          if (index > 0) {
            resultsSummary.appendChild(document.createTextNode(' '));
          }
          resultsSummary.appendChild(item);
        });
      }
    } else {
      resultsSummary.hidden = true;
      if (typeof resultsSummary.replaceChildren === 'function') {
        resultsSummary.replaceChildren();
      } else {
        resultsSummary.textContent = '';
      }
    }
  }

  const metricsContainer = resultsMetrics;
  const metricsData = metrics && typeof metrics === 'object' ? metrics : {};
  if (metricsContainer) {
    const metricItems = [];
    const addMetric = (value, labelKey, hintKey) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const card = document.createElement('div');
      card.className = 'results-metric';

      const valueEl = document.createElement('span');
      valueEl.className = 'results-metric__value';
      valueEl.textContent = formatInteger(numericValue);
      card.appendChild(valueEl);

      const labelText = translate(labelKey);
      const labelEl = document.createElement('span');
      labelEl.className = 'results-metric__label';
      labelEl.textContent = typeof labelText === 'string' ? labelText : labelKey;
      card.appendChild(labelEl);

      if (hintKey) {
        const hintText = translate(hintKey);
        if (typeof hintText === 'string' && hintText !== hintKey) {
          const hintEl = document.createElement('span');
          hintEl.className = 'results-metric__hint';
          hintEl.textContent = hintText;
          card.appendChild(hintEl);
        }
      }

      metricItems.push(card);
    };

    addMetric(metricsData.visitedStates, 'results_metric_states_label', 'results_metric_states_hint');
    addMetric(metricsData.combinationsEvaluated, 'results_metric_checked_label', 'results_metric_checked_hint');
    addMetric(metricsData.combinationsAccepted, 'results_metric_kept_label', 'results_metric_kept_hint');
    addMetric(metricsData.combinationsDiscarded, 'results_metric_discarded_label', 'results_metric_discarded_hint');
    addMetric(metricsData.branchesPruned, 'results_metric_pruned_label', 'results_metric_pruned_hint');

    if (metricItems.length) {
      metricsContainer.hidden = false;
      if (typeof metricsContainer.replaceChildren === 'function') {
        metricsContainer.replaceChildren(...metricItems);
      } else {
        metricsContainer.textContent = '';
        metricItems.forEach((item) => {
          metricsContainer.appendChild(item);
        });
      }
    } else {
      metricsContainer.hidden = true;
      if (typeof metricsContainer.replaceChildren === 'function') {
        metricsContainer.replaceChildren();
      } else {
        metricsContainer.textContent = '';
      }
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
