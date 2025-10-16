import { EPS } from './solver-core.js';

export const initSlider = ({
  maxValue = 11,
  stepScale = 10,
  colorMap = {},
  mutedColorMap = {},
  neutralColor = 'var(--slider-neutral)',
} = {}) => {
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const sliderStepToNumber = (raw) => {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return clamp(numeric, 0, maxValue * stepScale) / stepScale;
  };

  const formatSliderValue = (value) => {
    if (!Number.isFinite(value)) {
      return '0.0';
    }
    return value.toFixed(1);
  };

  const sliderValueToPercent = (value) => {
    const safeValue = clamp(Number(value) || 0, 0, maxValue);
    return `${((safeValue / maxValue) * 100).toFixed(2)}%`;
  };

  const normalizeTrackBand = (band) => {
    if (typeof band !== 'string') {
      return null;
    }
    const normalized = band.trim().toLowerCase();
    return colorMap[normalized] ? normalized : null;
  };

  const parseSliderBound = (value, fallback) => {
    if (value === null || value === undefined) {
      return fallback;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const normalizeSliderSegments = (segments) => {
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
        const band = normalizeTrackBand(segment && segment.band);
        const min = clamp(parseSliderBound(rawMin, 0), 0, maxValue);
        const max = clamp(Math.max(min, parseSliderBound(rawMax, maxValue)), 0, maxValue);
        return {
          band,
          start: min,
          end: max,
        };
      })
      .filter((segment) => segment.end > segment.start + EPS)
      .sort((a, b) => a.start - b.start || a.end - b.end);
  };

  const buildSliderTrackGradientFromNormalized = (segments, highlightBand = null) => {
    if (!Array.isArray(segments) || segments.length === 0) {
      return null;
    }

    const highlight = normalizeTrackBand(highlightBand);
    const parts = [];
    let cursor = 0;

    segments.forEach((segment) => {
      const start = clamp(Number(segment.start) || 0, 0, maxValue);
      const end = clamp(Number(segment.end) || 0, 0, maxValue);
      if (end <= cursor + EPS) {
        cursor = Math.max(cursor, end);
        return;
      }
      if (start > cursor + EPS) {
        parts.push(`${neutralColor} ${sliderValueToPercent(cursor)}`);
        parts.push(`${neutralColor} ${sliderValueToPercent(start)}`);
      }

      const segStart = Math.max(start, cursor);
      const segEnd = Math.max(segStart, end);
      const band = normalizeTrackBand(segment.band);
      let color = neutralColor;
      if (band) {
        if (highlight && band !== highlight) {
          color = mutedColorMap[band] || neutralColor;
        } else {
          color = colorMap[band] || neutralColor;
        }
      }
      parts.push(`${color} ${sliderValueToPercent(segStart)}`);
      parts.push(`${color} ${sliderValueToPercent(segEnd)}`);
      cursor = Math.max(cursor, segEnd);
    });

    if (cursor < maxValue - EPS) {
      parts.push(`${neutralColor} ${sliderValueToPercent(cursor)}`);
      parts.push(`${neutralColor} 100%`);
    }

    return `linear-gradient(90deg, ${parts.join(', ')})`;
  };

  const applyTrack = (styleBands = {}) => {
    const trackCache = new Map();

    Object.entries(styleBands || {}).forEach(([attr, segments]) => {
      const normalized = normalizeSliderSegments(segments);
      if (!normalized.length) {
        return;
      }
      trackCache.set(attr, {
        segments: normalized,
        gradients: new Map(),
      });
    });

    const getHighlightKey = (band) => {
      const normalized = normalizeTrackBand(band);
      return normalized || 'default';
    };

    const computeGradient = (attr, highlightKey) => {
      const entry = trackCache.get(attr);
      if (!entry) {
        return null;
      }
      if (!entry.gradients.has(highlightKey)) {
        const highlight = highlightKey === 'default' ? null : highlightKey;
        const gradient = buildSliderTrackGradientFromNormalized(entry.segments, highlight);
        entry.gradients.set(highlightKey, gradient);
      }
      return entry.gradients.get(highlightKey);
    };

    const setTrack = (slider, attr, band) => {
      if (!slider) {
        return;
      }
      const entry = trackCache.get(attr);
      if (!entry) {
        slider.style.removeProperty('--slider-track');
        return;
      }
      const highlightKey = getHighlightKey(band);
      const gradient = computeGradient(attr, highlightKey);
      if (gradient) {
        slider.style.setProperty('--slider-track', gradient);
      } else {
        slider.style.removeProperty('--slider-track');
      }
    };

    const getGradient = (attr, band) => {
      const entry = trackCache.get(attr);
      if (!entry) {
        return null;
      }
      const highlightKey = getHighlightKey(band);
      return computeGradient(attr, highlightKey);
    };

    return {
      setTrack,
      getGradient,
    };
  };

  const createSlider = (root) => {
    if (!root || typeof root !== 'object') {
      return null;
    }

    const clampValue = (value) => clamp(Number.isFinite(value) ? value : 0, 0, maxValue);
    const defaultSnapValue = (value) => {
      const safe = clampValue(value);
      return Math.round(safe * stepScale) / stepScale;
    };
    let snapStrategy = defaultSnapValue;
    const snapValue = (value) => {
      const safeInput = clampValue(value);
      const snapped = snapStrategy(safeInput);
      return clampValue(Number.isFinite(snapped) ? snapped : safeInput);
    };
    const percentFromValue = (value) => {
      const safe = clampValue(value);
      return (safe / maxValue) * 100;
    };

    const handles = new Map();
    const handleList = [];

    const getHandleKey = (el) => {
      for (const [key, state] of handles.entries()) {
        if (state.el === el) {
          return key;
        }
      }
      return null;
    };

    const updateHandlePosition = (state) => {
      const percent = percentFromValue(state.value);
      state.el.style.left = `${percent}%`;
      state.el.style.setProperty('--slider-thumb-position', `${percent.toFixed(2)}%`);
      state.el.setAttribute('aria-valuenow', formatSliderValue(state.value));
    };

    const updateTrackState = () => {
      const visibleHandles = handleList.filter((state) => state.visible);
      let start = 0;
      let end = 0;
      if (visibleHandles.length === 1) {
        end = percentFromValue(visibleHandles[0].value);
      } else if (visibleHandles.length >= 2) {
        const percents = visibleHandles.map((state) => percentFromValue(state.value));
        start = Math.min(...percents);
        end = Math.max(...percents);
      }
      root.style.setProperty('--slider-range-start', `${start.toFixed(2)}%`);
      root.style.setProperty('--slider-range-end', `${end.toFixed(2)}%`);
    };

    const emitHandleEvent = (state, type) => {
      const event = new Event(type, { bubbles: true });
      state.el.dispatchEvent(event);
    };

    const setHandleValue = (state, value, { emit = false } = {}) => {
      const next = snapValue(value);
      if (Math.abs(state.value - next) <= EPS) {
        if (emit) {
          emitHandleEvent(state, 'input');
        }
        return next;
      }
      state.value = next;
      updateHandlePosition(state);
      updateTrackState();
      if (emit) {
        emitHandleEvent(state, 'input');
      }
      return next;
    };

    const setHandleVisibility = (state, visible) => {
      state.visible = !!visible;
      if (state.visible) {
        state.el.removeAttribute('aria-hidden');
        state.el.hidden = false;
        state.el.style.display = '';
        if (!state.disabled) {
          state.el.setAttribute('tabindex', '0');
        }
      } else {
        state.el.setAttribute('aria-hidden', 'true');
        state.el.hidden = true;
        state.el.style.display = 'none';
        state.el.setAttribute('tabindex', '-1');
      }
      updateTrackState();
    };

    const setHandleDisabled = (state, disabled) => {
      state.disabled = !!disabled;
      if (state.disabled) {
        state.el.setAttribute('disabled', 'true');
        state.el.setAttribute('tabindex', '-1');
      } else if (state.visible) {
        state.el.removeAttribute('disabled');
        state.el.setAttribute('tabindex', '0');
      } else {
        state.el.removeAttribute('disabled');
      }
    };

    const createHandleState = (el, key) => {
      if (!el || !key || handles.has(key)) {
        return null;
      }
      const state = {
        key,
        el,
        value: 0,
        visible: true,
        disabled: false,
        keyInteraction: false,
      };
      handles.set(key, state);
      handleList.push(state);
      el.dataset.sliderHandle = key;
      el.setAttribute('role', 'slider');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-valuemin', formatSliderValue(0));
      el.setAttribute('aria-valuemax', formatSliderValue(maxValue));
      const initial = Number(el.dataset.initialValue);
      if (Number.isFinite(initial)) {
        state.value = snapValue(initial);
      } else {
        state.value = 0;
      }
      updateHandlePosition(state);
      return state;
    };

    const handleElements = Array.from(root.querySelectorAll('[data-slider-thumb]'));
    handleElements.forEach((el) => {
      const rawKey = el.dataset.sliderThumb || '';
      const key = rawKey === 'max' ? 'max' : 'min';
      createHandleState(el, key);
    });

    if (!handles.size) {
      return null;
    }

    updateTrackState();

    const valueFromClientX = (clientX) => {
      const rect = root.getBoundingClientRect();
      if (!rect || rect.width === 0) {
        return 0;
      }
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      return clampValue(ratio * maxValue);
    };

    const pickNearestHandle = (value) => {
      const visibleHandles = handleList.filter((state) => state.visible && !state.disabled);
      if (!visibleHandles.length) {
        return null;
      }
      let best = visibleHandles[0];
      let bestDist = Math.abs(best.value - value);
      for (let idx = 1; idx < visibleHandles.length; idx += 1) {
        const candidate = visibleHandles[idx];
        const dist = Math.abs(candidate.value - value);
        if (dist < bestDist) {
          best = candidate;
          bestDist = dist;
        }
      }
      return best;
    };

    const handlePointerDrag = (state, event) => {
      if (!state || state.disabled) {
        return;
      }
      event.preventDefault();
      state.el.focus({ preventScroll: true });
      const pointerId = event.pointerId;
      const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        const nextValue = valueFromClientX(moveEvent.clientX);
        setHandleValue(state, nextValue, { emit: true });
      };
      const onUp = (upEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        state.el.removeEventListener('pointermove', onMove);
        state.el.removeEventListener('pointerup', onUp);
        state.el.removeEventListener('pointercancel', onUp);
        try {
          state.el.releasePointerCapture(pointerId);
        } catch (error) {
          // ignore
        }
        emitHandleEvent(state, 'change');
      };
      state.el.addEventListener('pointermove', onMove);
      state.el.addEventListener('pointerup', onUp);
      state.el.addEventListener('pointercancel', onUp);
      state.el.setPointerCapture(pointerId);
      setHandleValue(state, valueFromClientX(event.clientX), { emit: true });
    };

    handleList.forEach((state) => {
      state.el.addEventListener('pointerdown', (event) => {
        handlePointerDrag(state, event);
      });

      state.el.addEventListener('keydown', (event) => {
        if (state.disabled) {
          return;
        }
        const key = event.key;
        let nextValue = state.value;
        const step = 1 / stepScale;
        if (key === 'ArrowLeft' || key === 'ArrowDown') {
          event.preventDefault();
          nextValue = state.value - step;
        } else if (key === 'ArrowRight' || key === 'ArrowUp') {
          event.preventDefault();
          nextValue = state.value + step;
        } else if (key === 'PageDown') {
          event.preventDefault();
          nextValue = state.value - Math.max(step, 1);
        } else if (key === 'PageUp') {
          event.preventDefault();
          nextValue = state.value + Math.max(step, 1);
        } else if (key === 'Home') {
          event.preventDefault();
          nextValue = 0;
        } else if (key === 'End') {
          event.preventDefault();
          nextValue = maxValue;
        } else {
          return;
        }
        state.keyInteraction = true;
        setHandleValue(state, nextValue, { emit: true });
      });

      state.el.addEventListener('keyup', (event) => {
        if (!state.keyInteraction) {
          return;
        }
        const key = event.key;
        if (
          key === 'ArrowLeft' ||
          key === 'ArrowRight' ||
          key === 'ArrowUp' ||
          key === 'ArrowDown' ||
          key === 'PageUp' ||
          key === 'PageDown' ||
          key === 'Home' ||
          key === 'End'
        ) {
          state.keyInteraction = false;
          emitHandleEvent(state, 'change');
        }
      });
    });

    root.addEventListener('pointerdown', (event) => {
      const target = event.target;
      if (target && target.closest('[data-slider-thumb]')) {
        return;
      }
      const value = valueFromClientX(event.clientX);
      const handle = pickNearestHandle(value);
      if (!handle) {
        return;
      }
      event.preventDefault();
      setHandleValue(handle, value, { emit: true });
      emitHandleEvent(handle, 'change');
    });

    const setActiveBand = (band) => {
      if (band) {
        root.dataset.activeColorBand = band;
      } else {
        delete root.dataset.activeColorBand;
      }
      handleList.forEach((state) => {
        if (band) {
          state.el.dataset.activeColorBand = band;
        } else {
          delete state.el.dataset.activeColorBand;
        }
      });
    };

    return {
      root,
      getHandle: (key) => (handles.has(key) ? handles.get(key).el : null),
      getHandles: () => handleList.map((state) => state.el),
      getHandleKey,
      getValue: (key) => (handles.has(key) ? handles.get(key).value : 0),
      setValue: (key, value, options = {}) => {
        if (!handles.has(key)) {
          return 0;
        }
        return setHandleValue(handles.get(key), value, options);
      },
      setVisibility: (key, visible) => {
        if (!handles.has(key)) {
          return;
        }
        setHandleVisibility(handles.get(key), visible);
      },
      setZIndex: (key, z) => {
        if (!handles.has(key)) {
          return;
        }
        const el = handles.get(key).el;
        if (typeof z === 'number') {
          el.style.zIndex = String(z);
        } else {
          el.style.removeProperty('z-index');
        }
      },
      setDisabled: (disabled) => {
        handleList.forEach((state) => {
          setHandleDisabled(state, disabled);
        });
        root.classList.toggle('range-slider--disabled', !!disabled);
      },
      setActiveBand,
      setSnapFunction: (fn) => {
        if (typeof fn === 'function') {
          snapStrategy = (value) => {
            const safe = clampValue(value);
            const next = fn(safe);
            return clampValue(Number.isFinite(next) ? next : safe);
          };
        } else {
          snapStrategy = defaultSnapValue;
        }
        handleList.forEach((state) => {
          const next = snapValue(state.value);
          if (Math.abs(state.value - next) > EPS) {
            state.value = next;
            updateHandlePosition(state);
          } else {
            state.value = next;
          }
        });
        updateTrackState();
      },
      refresh: () => {
        handleList.forEach((state) => {
          updateHandlePosition(state);
        });
        updateTrackState();
      },
    };
  };

  return {
    sliderStepToNumber,
    formatSliderValue,
    normalizeTrackBand,
    applyTrack,
    createSlider,
  };
};
