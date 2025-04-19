/**
 * Validates a content object against its schema
 * TODO: Needs to be update but also implemented in the build script.
 */
import { schemas } from './schema.js';

// Define field definition interface
interface FieldDefinition {
  type: string;
  required: boolean;
  default?: any;
  enum?: string[];
  rel?: string;
}

/**
 * Validates a content object against its schema
 * @param content - The content object to validate
 * @param type - The content type to validate against
 * @returns Validated and normalized content object
 */
export function validateContent(content: any, type: string): any {
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
      result[fieldName] = validateField(result[fieldName], fieldDef, fieldName, type);
    }
  }

  return result;
}

/**
 * Validates a single field against its definition
 * @param value - The value to validate
 * @param fieldDef - The field definition
 * @param fieldName - The name of the field
 * @param type - The content type
 * @returns The validated and potentially transformed value
 */
export function validateField(value: any, fieldDef: FieldDefinition, fieldName: string, type: string): any {
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
      return value;

    case "Number":
      // Allow string numbers and convert them
      if (typeof value === "string" && !isNaN(Number(value))) {
        return Number(value);
      } else if (typeof value !== "number") {
        throw new Error(`Field '${fieldName}' in ${type} must be a number`);
      }
      return value;

    case "Array":
      if (!Array.isArray(value)) {
        throw new Error(`Field '${fieldName}' in ${type} must be an array`);
      }
      return value;

    case "List":
      // Lists can be arrays or comma-separated strings
      if (typeof value === "string") {
        // Convert comma-separated string to array
        return value.split(",").map((item) => item.trim()).filter(Boolean);
      } else if (!Array.isArray(value)) {
        throw new Error(
          `Field '${fieldName}' in ${type} must be an array or comma-separated string`
        );
      }
      return value;

    case "Boolean":
      if (typeof value !== "boolean") {
        throw new Error(`Field '${fieldName}' in ${type} must be a boolean`);
      }
      return value;

    case "Object":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`Field '${fieldName}' in ${type} must be an object`);
      }
      return value;

    default:
      throw new Error(`Unknown field type: ${fieldDef.type}`);
  }
}
