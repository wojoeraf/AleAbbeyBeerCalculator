const parseJSONScript = (id, fallback) => {
  const el = document.getElementById(id);
  if (!el) return fallback;
  try {
    const txt = el.textContent || el.innerText || '';
    return txt ? JSON.parse(txt) : fallback;
  } catch (error) {
    console.error(`Konnte ${id} nicht parsen`, error);
    return fallback;
  }
};

const initSolver = () => {
  const styleMinMap = parseJSONScript('style-min-data', {});
  const ingredients = parseJSONScript('ingredients-data', []);
  const stylesData = parseJSONScript('styles-data', {});
  const metaData = parseJSONScript('meta-data', {});

  const styleNames = Object.keys(stylesData);
  const ATTRS = metaData.attrs || ['taste', 'color', 'strength', 'foam'];
  const attrLabels = metaData.attr_labels || metaData.attrLabels || {};
  const bandLabels = metaData.band_labels || metaData.bandLabels || {};
  const EPS = 1e-9;

  const attrCards = Array.from(document.querySelectorAll('[data-attr-card]'));
  const submitBtn = document.querySelector('[data-submit-button]');
  const setAllGreenBtn = document.querySelector('[data-set-all-green]');
  const styleSelect = document.querySelector('select[name="style"]');
  const ingredientRows = Array.from(document.querySelectorAll('[data-ingredient-row]'));
  const form = document.querySelector('[data-solver-form]');

  const resultsSection = document.querySelector('[data-results]');
  const resultsTitle = document.querySelector('[data-results-title]');
  const resultsSummary = document.querySelector('[data-results-summary]');
  const resultsList = document.querySelector('[data-results-list]');
  const resultsEmpty = document.querySelector('[data-results-empty]');
  const statusMessage = document.querySelector('[data-status-message]');
  const debugPanel = document.querySelector('[data-debug-panel]');
  const debugOutput = document.querySelector('[data-debug-output]');
  const debugToggle = document.getElementById('debug-toggle');
  const debugContent = document.querySelector('[data-debug-content]');

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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
      return { solutions: [], info: [`Unbekannter Stil: ${styleName}`] };
    }

    const n = ingredients.length;
    const base = (style.base || [0, 0, 0, 0]).map(Number);
    const vectors = ingredients.map((ing) => (ing.vec || [0, 0, 0, 0]).map(Number));
    const nameToIndex = new Map(ingredients.map((ing, idx) => [ing.name, idx]));

    const minCounts = new Array(n).fill(0);
    const mandatory = style.min_counts || {};
    Object.entries(mandatory).forEach(([name, cnt]) => {
      if (!nameToIndex.has(name)) return;
      const idx = nameToIndex.get(name);
      minCounts[idx] = Math.max(minCounts[idx], Number(cnt) || 0);
    });

    if (extraMinCounts) {
      Object.entries(extraMinCounts).forEach(([name, cnt]) => {
        if (!nameToIndex.has(name)) return;
        const idx = nameToIndex.get(name);
        minCounts[idx] = Math.max(minCounts[idx], Number(cnt) || 0);
      });
    }

    if (minCounts.some((cnt) => cnt > perCap)) {
      return { solutions: [], info: ['Pflichtanzahl übersteigt das Zutatencap.'] };
    }

    const minSum = minCounts.reduce((acc, val) => acc + val, 0);
    const adjustedTotalCap = Math.max(totalCap, minSum);

    const perAttrIntervals = ATTRS.map((attr) => numericIntervals[attr]);
    const allowedBandMap = {};
    ATTRS.forEach((attr) => {
      const pref = bandPreferences[attr];
      allowedBandMap[attr] = pref ? [...pref] : null;
    });

    const allowedIntervalsForAttr = (attr, allowedBands) => {
      const attrIndex = ATTRS.indexOf(attr);
      const startInterval =
        perAttrIntervals[attrIndex] || [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
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
      return { solutions: [], info: ['Keine passenden Intervalle für die gewählten Bänder.'] };
    }

    const suffixMinCounts = new Array(n + 1).fill(0);
    for (let idx = n - 1; idx >= 0; idx -= 1) {
      suffixMinCounts[idx] = minCounts[idx] + suffixMinCounts[idx + 1];
    }
    if (suffixMinCounts[0] > adjustedTotalCap) {
      return { solutions: [], info: ['Gesamtcap ist kleiner als die Summe der Pflichtzutaten.'] };
    }

    const suffixLo = Array.from({ length: n + 1 }, () => new Array(ATTRS.length).fill(0));
    const suffixHi = Array.from({ length: n + 1 }, () => new Array(ATTRS.length).fill(0));
    for (let idx = n - 1; idx >= 0; idx -= 1) {
      const vec = vectors[idx];
      const loCnt = minCounts[idx];
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
            const key = counts.join('|');
            if (seenCombos.has(key)) {
              return;
            }
            seenCombos.add(key);

            const bands = {};
            for (let k = 0; k < ATTRS.length; k += 1) {
              const attr = ATTRS[k];
              bands[attr] = detectBand(style, attr, totals[k]) || 'n/a';
            }

            const countsByName = {};
            counts.forEach((cnt, ingredientIdx) => {
              if (cnt > 0) {
                countsByName[ingredients[ingredientIdx].name] = cnt;
              }
            });

            const totalsRounded = totals.map((val) => Math.round(val * 1000) / 1000);
            solutions.push({
              x: counts.slice(),
              sum: counts.reduce((acc, val) => acc + val, 0),
              totals: totalsRounded,
              bands,
              countsByName,
            });
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
          const minC = minCounts[idx];
          if (maxC < minC) {
            return;
          }

          const vec = vectors[idx];
          for (let c = minC; c <= maxC; c += 1) {
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

    solutions.sort((a, b) => {
      if (a.sum !== b.sum) return a.sum - b.sum;
      for (let k = 0; k < ATTRS.length; k += 1) {
        const diff = a.totals[k] - b.totals[k];
        if (Math.abs(diff) > EPS) return diff;
      }
      for (let i = 0; i < a.x.length; i += 1) {
        if (a.x[i] !== b.x[i]) return a.x[i] - b.x[i];
      }
      return 0;
    });

    const uniq = [];
    const seen = new Set();
    for (const solution of solutions) {
      const key = solution.x.join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(solution);
      if (uniq.length >= topK) break;
    }

    return { solutions: uniq, info: [] };
  };

  const updateSubmitState = () => {
    if (!submitBtn) return;
    const hasConstraint = attrCards.some((card) => {
      const selectedBand = card.querySelector('input[type="radio"]:checked');
      const modeSelect = card.querySelector('.mode-select');
      const bandActive = selectedBand && selectedBand.value !== 'any';
      const modeActive = modeSelect && modeSelect.value !== 'any';
      return bandActive || modeActive;
    });
    submitBtn.disabled = !hasConstraint;
  };

  attrCards.forEach((card) => {
    const modeSelect = card.querySelector('.mode-select');
    const minInput = card.querySelector('.min-input');
    const maxInput = card.querySelector('.max-input');

    if (!modeSelect || !minInput || !maxInput) {
      return;
    }

    const toggle = () => {
      const mode = modeSelect.value;
      if (mode === 'any') {
        minInput.disabled = true;
        maxInput.disabled = true;
      } else if (mode === 'ge') {
        minInput.disabled = false;
        maxInput.disabled = true;
      } else if (mode === 'le') {
        minInput.disabled = true;
        maxInput.disabled = false;
      } else {
        minInput.disabled = false;
        maxInput.disabled = false;
      }
      updateSubmitState();
    };

    toggle();
    modeSelect.addEventListener('change', toggle);
    card.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener('change', updateSubmitState);
    });
  });

  if (setAllGreenBtn) {
    setAllGreenBtn.addEventListener('click', () => {
      attrCards.forEach((card) => {
        const greenRadio = card.querySelector('input[type="radio"][value="green"]');
        if (greenRadio) {
          greenRadio.checked = true;
        }
      });
      updateSubmitState();
    });
  }

  ingredientRows.forEach((row) => {
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    checkbox.addEventListener('change', () => {
      checkbox.dataset.userSelected = checkbox.checked ? 'true' : 'false';
    });
  });

  const applyStyleRequirements = (styleName) => {
    if (!styleName) return;
    const activeMins = styleMinMap[styleName] || {};

    ingredientRows.forEach((row) => {
      const ingredientName = row.dataset.ingredientName;
      const checkbox = row.querySelector('input[type="checkbox"]');
      const label = row.querySelector('.ingredient-option');
      const badge = row.querySelector('[data-required-badge]');
      if (!checkbox || !ingredientName) {
        return;
      }
      const requiredCount = activeMins[ingredientName] || 0;
      if (requiredCount > 0) {
        row.classList.add('ingredient-locked');
        checkbox.checked = true;
        checkbox.disabled = true;
        checkbox.dataset.userSelected = 'false';
        if (label) {
          label.title = 'Diese Zutat ist vorgegeben.';
        }
        if (badge) {
          badge.hidden = false;
          badge.textContent = requiredCount > 1 ? `Pflicht × ${requiredCount}` : 'Pflicht';
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

  const renderSolutions = (solutions, summaryLines, infoMessages) => {
    if (!resultsSection) return;
    resultsSection.hidden = false;
    const count = solutions.length;
    if (resultsTitle) {
      resultsTitle.textContent = `Ergebnisse (${count})`;
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
    if (resultsList) {
      resultsList.innerHTML = '';
    }
    if (count === 0) {
      return;
    }

    solutions.forEach((solution) => {
      const card = document.createElement('div');
      card.className = 'card';

      const heading = document.createElement('h3');
      heading.style.marginTop = '0';
      heading.textContent = `Gesamtzutaten: ${solution.sum}`;
      card.appendChild(heading);

      const mixTitle = document.createElement('p');
      mixTitle.style.marginBottom = '8px';
      mixTitle.style.fontWeight = '600';
      mixTitle.textContent = 'Zutatenmix';
      card.appendChild(mixTitle);

      const chipsContainer = document.createElement('div');
      chipsContainer.className = 'chips';
      chipsContainer.style.marginBottom = '12px';
      Object.entries(solution.countsByName).forEach(([name, cnt]) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        const span = document.createElement('span');
        span.textContent = `${name} × ${cnt}`;
        chip.appendChild(span);
        chipsContainer.appendChild(chip);
      });
      card.appendChild(chipsContainer);

      const totalsText = document.createElement('p');
      totalsText.style.margin = '0 0 10px';
      totalsText.textContent = `Geschmack ${solution.totals[0]}, Farbe ${solution.totals[1]}, Stärke ${solution.totals[2]}, Schaum ${solution.totals[3]}`;
      card.appendChild(totalsText);

      const pillContainer = document.createElement('div');
      pillContainer.style.display = 'flex';
      pillContainer.style.flexWrap = 'wrap';
      pillContainer.style.gap = '8px';
      pillContainer.style.marginBottom = '12px';
      ATTRS.forEach((attr) => {
        const band = solution.bands[attr];
        const pill = document.createElement('span');
        pill.className = `pill ${String(band).replace(/\//g, '-')}`;
        const label = attrLabels[attr] || attr;
        pill.textContent = `${label}: ${bandLabels[band] || band}`;
        pillContainer.appendChild(pill);
      });
      card.appendChild(pillContainer);

      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Roh-Vektor';
      details.appendChild(summary);
      const pre = document.createElement('pre');
      pre.className = 'mono';
      pre.textContent = JSON.stringify(solution.x);
      details.appendChild(pre);
      card.appendChild(details);

      resultsList?.appendChild(card);
    });
  };

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
      if (!styleName && styleNames.length) {
        styleName = styleNames[0];
      }
      if (styleName && !(styleName in stylesData) && styleNames.length) {
        styleName = styleNames[0];
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
        } else if (mode === 'between') {
          const lower = Math.min(minVal === null ? 0 : minVal, maxVal === null ? 11 : maxVal);
          const upper = Math.max(minVal === null ? 0 : minVal, maxVal === null ? 11 : maxVal);
          lo = lower;
          hi = upper;
          debugLo = lower;
          debugHi = upper;
        } else {
          debugLo = 0;
          debugHi = 11;
        }

        numericIntervals[attr] = [lo, hi];
        debugIntervals[attr] = [debugLo, debugHi];
      });

      const selectedOptional = new Set(formData.getAll('optional_ingredients'));
      const extraMinCounts = {};
      selectedOptional.forEach((name) => {
        extraMinCounts[name] = Math.max(extraMinCounts[name] || 0, 1);
      });

      debugLines.push(`Stil: ${styleName || '—'}`);
      debugLines.push(`Gesamt-Cap: ${totalCap}, Pro-Zutat-Cap: ${perCap}`);
      debugLines.push('Einstellungen je Attribut:');
      ATTRS.forEach((attr) => {
        const interval = debugIntervals[attr] || [0, 11];
        const bandPref = bandPreferences[attr];
        const bandKey = bandPref && bandPref.length === 1 ? bandPref[0] : 'any';
        const bandText = bandLabels[bandKey] || (bandPref ? bandPref.join(', ') : 'Egal');
        debugLines.push(
          `  ${attrLabels[attr] || attr} → Band: ${bandText}, Intervall: [${formatIntervalValue(
            interval[0],
          )}, ${formatIntervalValue(interval[1])}]`,
        );
      });
      if (selectedOptional.size) {
        debugLines.push(
          'Zusätzliche gewünschte Zutaten: ' + Array.from(selectedOptional).sort().join(', '),
        );
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
        summaryLines.push(`Stil: ${styleName}`);
      }
      summaryLines.push(`Cap gesamt ${totalCap}, pro Zutat ${perCap}`);

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
