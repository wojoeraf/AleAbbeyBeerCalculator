import { solveRecipe } from './solver-core.js';
import { createTranslator } from './i18n.js';

const workerState = {
  attrs: [],
  styles: {},
  ingredients: [],
  messages: {},
  uiStrings: {},
  styleNameMap: {},
};

let translate = (key) => key;
let displayStyleName = (id) => id || '';
let activeSolveId = null;
let abortRequested = false;

const applyInit = (payload = {}) => {
  workerState.attrs = Array.isArray(payload.attrs) ? payload.attrs : [];
  workerState.styles = payload.styles && typeof payload.styles === 'object' ? payload.styles : {};
  workerState.ingredients = Array.isArray(payload.ingredients) ? payload.ingredients : [];
  workerState.messages = payload.messages && typeof payload.messages === 'object' ? payload.messages : {};
  workerState.uiStrings = payload.uiStrings && typeof payload.uiStrings === 'object' ? payload.uiStrings : {};
  workerState.styleNameMap = payload.styleNameMap && typeof payload.styleNameMap === 'object'
    ? payload.styleNameMap
    : {};
  translate = createTranslator(workerState.messages, workerState.uiStrings);
  displayStyleName = (styleId) => {
    if (!styleId) {
      return translate('style_unknown');
    }
    return workerState.styleNameMap[styleId] || styleId;
  };
};

const respond = (id, type, payload) => {
  self.postMessage({ id, type, payload });
};

const respondWithError = (id, error) => {
  const message = error && typeof error.message === 'string' ? error.message : String(error || 'Worker error');
  respond(id, 'error', { message });
};

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const { id, type, payload } = data;

  if (!type) {
    respondWithError(id, new Error('Unknown worker message'));
    return;
  }

  if (type === 'init') {
    try {
      applyInit(payload);
      respond(id, 'ready', true);
    } catch (error) {
      respondWithError(id, error);
    }
    return;
  }

  if (type === 'solve') {
    try {
      const params = payload && typeof payload === 'object' ? payload.params : null;
      if (!params || typeof params !== 'object') {
        throw new Error('Missing solve parameters');
      }
      activeSolveId = id;
      abortRequested = false;
      const result = solveRecipe({
        ...params,
        attrs: workerState.attrs,
        styles: workerState.styles,
        ingredients: workerState.ingredients,
        translate,
        displayStyleName,
        onProgress: (update) => {
          if (activeSolveId === id) {
            respond(id, 'progress', update);
          }
        },
        shouldAbort: () => abortRequested,
      });
      respond(id, 'result', result);
    } catch (error) {
      respondWithError(id, error);
    } finally {
      if (activeSolveId === id) {
        activeSolveId = null;
        abortRequested = false;
      }
    }
    return;
  }

  if (type === 'cancel') {
    const targetId = payload && typeof payload === 'object' ? payload.targetId : undefined;
    if (activeSolveId !== null && (targetId === undefined || targetId === activeSolveId)) {
      abortRequested = true;
    }
    if (id !== undefined && id !== null) {
      respond(id, 'cancelled', { ok: true });
    }
    return;
  }

  respondWithError(id, new Error(`Unsupported worker message type: ${type}`));
});
