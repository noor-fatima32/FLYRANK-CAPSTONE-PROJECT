const ALLOWED_WIDGET_TYPES = new Set([
  'signup_form',
  'contact_form',
  'cta_popover'
]);

const ALLOWED_FIELD_TYPES = new Set([
  'text',
  'email',
  'url',
  'number'
]);

function validateWidgetInput(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.type !== undefined) {
    if (
      typeof body.type !== 'string' ||
      !ALLOWED_WIDGET_TYPES.has(body.type)
    ) {
      errors.push('type must be signup_form, contact_form, or cta_popover');
    }
  }

  if (!partial || body.title !== undefined) {
    if (
      typeof body.title !== 'string' ||
      body.title.trim().length === 0 ||
      body.title.length > 200
    ) {
      errors.push('title must be a non-empty string of at most 200 characters');
    }
  }

  if (body.description !== undefined && body.description !== null) {
    if (
      typeof body.description !== 'string' ||
      body.description.length > 1000
    ) {
      errors.push('description must be at most 1000 characters');
    }
  }

  if (!partial || body.fields !== undefined) {
    if (!Array.isArray(body.fields) || body.fields.length === 0 || body.fields.length > 20) {
      errors.push('fields must contain between 1 and 20 fields');
    } else {
      const names = new Set();

      body.fields.forEach((field, index) => {
        if (!field || typeof field !== 'object' || Array.isArray(field)) {
          errors.push(`fields[${index}] must be an object`);
          return;
        }

        if (
          typeof field.name !== 'string' ||
          !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.name) ||
          field.name.length > 50
        ) {
          errors.push(`fields[${index}].name is invalid`);
        } else if (names.has(field.name)) {
          errors.push(`duplicate field name: ${field.name}`);
        } else {
          names.add(field.name);
        }

        if (
          typeof field.type !== 'string' ||
          !ALLOWED_FIELD_TYPES.has(field.type)
        ) {
          errors.push(`fields[${index}].type is invalid`);
        }

        if (
          typeof field.label !== 'string' ||
          field.label.trim().length === 0 ||
          field.label.length > 100
        ) {
          errors.push(`fields[${index}].label is invalid`);
        }

        if (typeof field.required !== 'boolean') {
          errors.push(`fields[${index}].required must be boolean`);
        }
      });
    }
  }

  if (body.button_text !== undefined) {
    if (
      typeof body.button_text !== 'string' ||
      body.button_text.trim().length === 0 ||
      body.button_text.length > 100
    ) {
      errors.push('button_text must be a non-empty string of at most 100 characters');
    }
  }

  if (body.display_options !== undefined) {
    if (
      !body.display_options ||
      typeof body.display_options !== 'object' ||
      Array.isArray(body.display_options)
    ) {
      errors.push('display_options must be an object');
    }
  }

  return errors;
}

module.exports = {
  validateWidgetInput,
  ALLOWED_FIELD_TYPES
};