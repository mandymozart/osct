/**
 * Field-level validation of authored YAML against `schemas`: required fields, defaults, type coercion.
 * Cross-file checks (references, targets, page ranges) live in the build script.
 */
import { Authored, ContentType, SchemaField, schemas } from './schema.js';

const isContentType = (type: string): type is ContentType => Object.hasOwn(schemas, type);

/**
 * Validates a content object against its schema
 * @param content - The content object to validate (a YAML mapping)
 * @param type - The content type to validate against
 * @returns Validated and normalized content object
 */
export function validateContent<T extends ContentType>(content: unknown, type: T): Authored<T>;
export function validateContent(content: unknown, type: string): Record<string, unknown>;
export function validateContent(content: unknown, type: string): Record<string, unknown> {
  if (!isContentType(type)) {
    throw new Error(`Unknown content type: ${type}`);
  }
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    throw new Error(`Expected the fields of a ${type}`);
  }

  const fields: Record<string, SchemaField> = schemas[type].fields;
  const result: Record<string, unknown> = { ...content };

  for (const [fieldName, fieldDef] of Object.entries(fields)) {
    if (fieldDef.required && result[fieldName] === undefined) {
      throw new Error(`Required field '${fieldName}' missing for ${type}`);
    }

    if (result[fieldName] === undefined && fieldDef.default !== undefined) {
      result[fieldName] = fieldDef.default;
    }

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
export function validateField(value: unknown, fieldDef: SchemaField, fieldName: string, type: string): unknown {
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
      // Lists can be arrays of strings or comma-separated strings
      if (typeof value === "string") {
        return value.split(",").map((item) => item.trim()).filter(Boolean);
      } else if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        throw new Error(
          `Field '${fieldName}' in ${type} must be an array of strings or comma-separated string`
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
