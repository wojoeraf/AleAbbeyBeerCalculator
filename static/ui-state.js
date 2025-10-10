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
    submitBtn: document.querySelector('[data-submit-button]'),
    setAllGreenBtn: document.querySelector('[data-set-all-green]'),
    styleSelect: document.querySelector('select[name="style"]'),
    ingredientRows: Array.from(document.querySelectorAll('[data-ingredient-row]')),
    form: document.querySelector('[data-solver-form]'),
    ingredientsWrapper: document.querySelector('[data-ingredients-wrapper]'),
    categoryBodies: collectCategoryMap('[data-ingredient-category]', 'categoryId'),
    categoryHeaders: collectCategoryMap('[data-category-header]', 'categoryId'),
    categoryToggles: collectCategoryMap('[data-category-toggle]', 'categoryId'),
    mobileAttrToggle: document.querySelector('[data-attribute-toggle]'),
    mobileAttrToggleInput: document.querySelector('[data-attribute-toggle-input]'),
    stackedLayoutQuery: typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(max-width: 640px)')
      : null,
    resultsSection: document.querySelector('[data-results]'),
    resultsTitle: document.querySelector('[data-results-title]'),
    resultsSummary: document.querySelector('[data-results-summary]'),
    resultsPlaceholder: document.querySelector('[data-results-placeholder]'),
    resultsLoading: document.querySelector('[data-results-loading]'),
    resultsList: document.querySelector('[data-results-list]'),
    resultsEmpty: document.querySelector('[data-results-empty]'),
    statusMessage: document.querySelector('[data-status-message]'),
    resultsControls: document.querySelector('[data-results-controls]'),
    sortAttrSelect: document.querySelector('[data-sort-attr]'),
    sortOrderSelect: document.querySelector('[data-sort-order]'),
    debugPanel: document.querySelector('[data-debug-panel]'),
    debugOutput: document.querySelector('[data-debug-output]'),
    debugToggle: document.getElementById('debug-toggle'),
    debugContent: document.querySelector('[data-debug-content]'),
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
