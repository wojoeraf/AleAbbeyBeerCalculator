const clearChildren = (node) => {
  if (!node) return;
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
};

let cachedContext = null;

export const renderResults = (solutions, dictionaries) => {
  cachedContext = dictionaries ? { ...dictionaries } : cachedContext;
  if (!cachedContext) {
    return;
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
    summaryLines = [],
    infoMessages = [],
    isLoading = false,
    hasRenderedResults = false,
  } = cachedContext;

  const {
    resultsSection,
    resultsTitle,
    resultsSummary,
    resultsPlaceholder,
    resultsLoading,
    resultsList,
    resultsEmpty,
    statusMessage,
    resultsControls,
  } = selectors;

  if (!resultsSection) {
    return;
  }

  if (resultsLoading) {
    resultsLoading.hidden = !isLoading;
  }

  if (resultsTitle) {
    resultsTitle.textContent = translate('results_heading');
  }

  if (isLoading) {
    if (resultsPlaceholder) resultsPlaceholder.hidden = true;
    if (resultsSummary) resultsSummary.hidden = true;
    if (statusMessage) statusMessage.hidden = true;
    if (resultsEmpty) resultsEmpty.hidden = true;
    if (resultsControls) resultsControls.hidden = true;
    if (resultsList) clearChildren(resultsList);
    return;
  }

  if (!hasRenderedResults) {
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
    if (resultsList) clearChildren(resultsList);
    return;
  }

  if (resultsPlaceholder) {
    resultsPlaceholder.hidden = true;
  }

  if (resultsTitle) {
    const count = Array.isArray(solutions) ? solutions.length : 0;
    const titleText = translate('results_title', { count });
    resultsTitle.textContent = typeof titleText === 'string'
      ? titleText
      : translate('results_heading');
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

  const list = Array.isArray(solutions) ? solutions : [];
  const count = list.length;

  if (resultsEmpty) {
    resultsEmpty.hidden = count !== 0;
  }

  if (resultsControls) {
    resultsControls.hidden = count === 0;
  }

  if (resultsList) {
    clearChildren(resultsList);
  }

  if (count === 0) {
    return;
  }

  list.forEach((solution, index) => {
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
      const rawValue = Number(solution.totals[idx]);
      const value = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
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
