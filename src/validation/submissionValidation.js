function validateSubmissionData(widget, data) {
  const errors = [];

  let fields;

  try {
    fields = JSON.parse(widget.fields_json || '[]');
  } catch {
    return ['widget field configuration is invalid'];
  }

  const fieldMap = new Map(fields.map(field => [field.name, field]));

  for (const [key, value] of Object.entries(data)) {
    const field = fieldMap.get(key);

    if (!field) {
      errors.push(`unexpected field: ${key}`);
      continue;
    }

    if (typeof value !== 'string') {
      errors.push(`${key} must be a string`);
      continue;
    }

    if (value.length > 1000) {
      errors.push(`${key} exceeds maximum length of 1000 characters`);
      continue;
    }

    if (field.type === 'email') {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(value)) {
        errors.push(`${key} must be a valid email address`);
      }
    }

    if (field.type === 'url') {
      try {
        new URL(value);
      } catch {
        errors.push(`${key} must be a valid URL`);
      }
    }
  }

  for (const field of fields) {
    if (
      field.required &&
      (data[field.name] === undefined ||
       data[field.name] === null ||
       String(data[field.name]).trim() === '')
    ) {
      errors.push(`${field.name} is required`);
    }
  }

  return errors;
}

module.exports = {
  validateSubmissionData
};