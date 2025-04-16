/**
 * Validates a content object against its schema
 * @param {Object} content - The content object to validate
 * @param {String} type - The content type to validate against
 * @returns {Object} - Validated and normalized content object
 */
export function validateContent(content, type) {
  if (!schemas[type]) {
    throw new Error(`Unknown content type: ${type}`);
  }

  const schema = schemas[type];
  const result = { ...content };

  // Validate and apply defaults for each field
  for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
    // Check required fields
    if (fieldDef.required && result[fieldName] === undefined) {
      throw new Error(`Required field '${fieldName}' missing for ${type}`);
    }

    // Apply defaults for missing fields
    if (result[fieldName] === undefined && fieldDef.default !== undefined) {
      result[fieldName] = fieldDef.default;
    }

    // Validate field if present
    if (result[fieldName] !== undefined) {
      validateField(result[fieldName], fieldDef, fieldName, type);
    }
  }

  return result;
}

/**
 * Validates a single field against its definition
 * @param {any} value - The value to validate
 * @param {Object} fieldDef - The field definition
 * @param {String} fieldName - The name of the field
 * @param {String} type - The content type
 */
export function validateField(value, fieldDef, fieldName, type) {
  switch (fieldDef.type) {
    case "String":
      if (typeof value !== "string") {
        throw new Error(`Field '${fieldName}' in ${type} must be a string`);
      }

      if (fieldDef.enum && !fieldDef.enum.includes(value)) {
        throw new Error(
          `Field '${fieldName}' in ${type} must be one of: ${fieldDef.enum.join(
            ", "
          )}`
        );
      }
      break;

    case "Number":
      if (typeof value !== "number") {
        throw new Error(`Field '${fieldName}' in ${type} must be a number`);
      }
      break;

    case "Array":
      if (!Array.isArray(value)) {
        throw new Error(`Field '${fieldName}' in ${type} must be an array`);
      }
      break;

    case "List":
      // Lists can be arrays or comma-separated strings
      if (typeof value === "string") {
        // Convert comma-separated string to array
        return value.split(",").map((item) => item.trim());
      } else if (!Array.isArray(value)) {
        throw new Error(
          `Field '${fieldName}' in ${type} must be an array or comma-separated string`
        );
      }
      break;

    case "Boolean":
      if (typeof value !== "boolean") {
        throw new Error(`Field '${fieldName}' in ${type} must be a boolean`);
      }
      break;

    case "Object":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`Field '${fieldName}' in ${type} must be an object`);
      }
      break;

    default:
      throw new Error(`Unknown field type: ${fieldDef.type}`);
  }
}

/**
 * Sorts an array of content objects based on the schema's orderBy field
 * @param {Array} contentArray - Array of content objects
 * @param {String} type - The content type
 * @returns {Array} - Sorted array
 */
export function sortContent(contentArray, type) {
  if (!schemas[type] || !schemas[type].orderBy) {
    return contentArray; // No ordering defined, return as is
  }

  const orderBy = schemas[type].orderBy;

  return [...contentArray].sort((a, b) => {
    const valueA = a[orderBy] !== undefined ? a[orderBy] : 0;
    const valueB = b[orderBy] !== undefined ? b[orderBy] : 0;

    if (typeof valueA === "number" && typeof valueB === "number") {
      return valueA - valueB;
    }

    return String(valueA).localeCompare(String(valueB));
  });
}
