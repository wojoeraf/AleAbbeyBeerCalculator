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

  const updateSliderProgress = (slider) => {
    if (!slider) return;
    const max = Number(slider.max) || 1;
    const value = clamp(Number(slider.value), 0, max);
    const percent = (value / max) * 100;
    slider.style.setProperty('--slider-progress', `${percent}%`);
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

  return {
    sliderStepToNumber,
    formatSliderValue,
    updateSliderProgress,
    normalizeTrackBand,
    applyTrack,
  };
};
