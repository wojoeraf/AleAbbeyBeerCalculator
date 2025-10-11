export const formatTemplate = (template, replacements = {}) => {
  if (typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      const value = replacements[key];
      if (value === null || value === undefined) {
        return '';
      }
      return String(value);
    }
    return match;
  });
};

export const createTranslator = (messages = {}, uiStrings = {}) => (key, replacements = {}) => {
  if (typeof messages[key] === 'string') {
    return formatTemplate(messages[key], replacements);
  }
  if (typeof uiStrings[key] === 'string') {
    return formatTemplate(uiStrings[key], replacements);
  }
  return key;
};
