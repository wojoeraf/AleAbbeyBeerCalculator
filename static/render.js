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
  } = dictionaries;

  const index = typeof dictionaries.index === 'number' ? dictionaries.index : 0;

  const card = document.createElement('article');
  card.className = 'card result-card';

  const header = document.createElement('div');
  header.className = 'result-card-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'result-card-title-row';

  const heading = document.createElement('h3');
  const sum = Number.isFinite(solution && solution.sum) ? solution.sum : 0;
  heading.textContent = translate('solutions_total', { count: sum });
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
    resultsControls,
  } = selectors;

  if (!resultsSection) {
    return { cards: [] };
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
    if (resultsControls) resultsControls.hidden = true;
    return { cards: [] };
  }

  const hasSolutions = Array.isArray(solutions);

  if (!hasSolutions) {
    if (resultsPlaceholder) resultsPlaceholder.hidden = false;
    if (resultsSummary) {
      resultsSummary.hidden = true;
      resultsSummary.textContent = '';
    }
    if (statusMessage) {
      statusMessage.hidden = true;
      statusMessage.textContent = '';
    }
    if (resultsEmpty) resultsEmpty.hidden = true;
    if (resultsControls) resultsControls.hidden = true;
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
    if (Array.isArray(summary) && summary.length) {
      resultsSummary.hidden = false;
      resultsSummary.textContent = summary.join(' • ');
    } else {
      resultsSummary.hidden = true;
      resultsSummary.textContent = '';
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

  if (resultsControls) {
    resultsControls.hidden = count === 0;
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
