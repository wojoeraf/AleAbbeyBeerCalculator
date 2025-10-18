const sliderBandColorMap = {
  green: 'var(--slider-green)',
  yellow: 'var(--slider-yellow)',
  red: 'var(--slider-red)',
};

const sliderBandMutedColorMap = {
  green: 'var(--slider-green-muted)',
  yellow: 'var(--slider-yellow-muted)',
  red: 'var(--slider-red-muted)',
};

const sliderNeutralColor = 'var(--slider-neutral)';

const collectCategoryMap = (selector, attr) => new Map(
  Array.from(document.querySelectorAll(selector)).map((el) => [el.dataset[attr], el]),
);

export const initUIState = () => {
  const attrCards = Array.from(document.querySelectorAll('[data-attr-card]'));

  const selectors = {
    attrCards,
    setAllGreenBtn: document.querySelector('[data-set-all-green]'),
    styleSelect: document.querySelector('select[name="style"]'),
    ingredientRows: Array.from(document.querySelectorAll('[data-ingredient-row]')),
    form: document.querySelector('[data-solver-form]'),
    ingredientsWrapper: document.querySelector('[data-ingredients-wrapper]'),
    optionalToggle: document.querySelector('[data-toggle-optional]'),
    categoryOptionalToggle: document.querySelector('[data-category-optional]'),
    detailsToggle: document.querySelector('[data-toggle-details]'),
    categoryPanels: collectCategoryMap('[data-ingredient-category]', 'categoryId'),
    categoryTabs: collectCategoryMap('[data-category-toggle]', 'categoryId'),
    targetSummaryRows: collectCategoryMap('[data-target-summary-row]', 'targetSummaryRow'),
    resultsSection: document.querySelector('[data-results]'),
    resultsTitle: document.querySelector('[data-results-title]'),
    resultsPlaceholder: document.querySelector('[data-results-placeholder]'),
    resultsLoading: document.querySelector('[data-results-loading]'),
    resultsList: document.querySelector('[data-results-list]'),
    resultsEmpty: document.querySelector('[data-results-empty]'),
    statusMessage: document.querySelector('[data-status-message]'),
    resultsHeader: document.querySelector('[data-results-header]'),
    resultsProgress: document.querySelector('[data-results-progress]'),
    resultsProgressText: document.querySelector('[data-results-progress-text]'),
    resultsStop: document.querySelector('[data-stop-solver]'),
    debugPanel: document.querySelector('[data-debug-panel]'),
    debugOutput: document.querySelector('[data-debug-output]'),
    debugToggle: document.getElementById('debug-toggle'),
    debugContent: document.querySelector('[data-debug-content]'),
    legacyToggle: document.querySelector('[data-legacy-toggle]'),
    themeToggle: document.querySelector('[data-theme-toggle]'),
    themeToggleText: document.querySelector('[data-theme-toggle-text]'),
    mixPanel: document.querySelector('[data-mix-panel]'),
    mixList: document.querySelector('[data-mix-selected]'),
    mixToggle: document.querySelector('[data-mix-toggle]'),
    mixSummary: document.querySelector('[data-mix-summary]'),
    mixCaps: Array.from(document.querySelectorAll('[data-cap-value]')),
    styleGhosts: collectCategoryMap('[data-style-ghost]', 'styleGhost'),
  };

  const attrs = attrCards.map((card) => card.dataset.attr).filter(Boolean);

  return {
    attrs: {
      list: attrs,
      sliderMaxValue: 11,
      sliderStepScale: 10,
    },
    bands: {
      colorMap: sliderBandColorMap,
      mutedColorMap: sliderBandMutedColorMap,
      neutralColor: sliderNeutralColor,
    },
    caps: {
      min: 1,
      max: 99,
    },
    selection: {
      ingredientRows: selectors.ingredientRows,
      colorUpdaters: [],
    },
    style: {
      select: selectors.styleSelect,
    },
    selectors,
  };
};
