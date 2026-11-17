import { BadRequestException } from '@nestjs/common';
import type { AttributeDataType, Role } from '@catv/shared';

export interface DefinitionRule {
  key: string;
  dataType: AttributeDataType;
  options: unknown;
  required: boolean;
  applicableRoles: Role[];
  targetUserId: string | null;
  deletedAt: Date | null;
}

export function applicableDefinitions(
  definitions: DefinitionRule[],
  role: Role,
  userId: string | null,
): DefinitionRule[] {
  return definitions.filter((definition) => {
    if (definition.deletedAt) {
      return false;
    }
    if (definition.targetUserId) {
      return userId !== null && definition.targetUserId === userId;
    }
    return definition.applicableRoles.includes(role);
  });
}

export function validateCustomData(
  definitions: DefinitionRule[],
  role: Role,
  userId: string | null,
  data: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const applicable = applicableDefinitions(definitions, role, userId);
  const byKey = new Map(applicable.map((definition) => [definition.key, definition]));
  const normalized: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(data)) {
    const definition = byKey.get(key);
    if (!definition) {
      throw new BadRequestException(`Unknown custom attribute "${key}".`);
    }
    normalized[key] = coerceValue(definition, value);
  }

  for (const definition of applicable) {
    if (definition.required && normalized[definition.key] === undefined) {
      throw new BadRequestException(`"${definition.key}" is required.`);
    }
  }

  return normalized;
}

function coerceValue(definition: DefinitionRule, value: unknown): string | number | boolean {
  if (value === undefined || value === null || value === '') {
    throw new BadRequestException(`"${definition.key}" cannot be empty.`);
  }
  switch (definition.dataType) {
    case 'TEXT':
      if (typeof value !== 'string' || value.trim().length === 0 || value.length > 500) {
        throw new BadRequestException(`"${definition.key}" must be text.`);
      }
      return value.trim();
    case 'NUMBER': {
      const numberValue = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numberValue)) {
        throw new BadRequestException(`"${definition.key}" must be a number.`);
      }
      return numberValue;
    }
    case 'DATE':
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new BadRequestException(`"${definition.key}" must be a date.`);
      }
      return value;
    case 'BOOLEAN':
      if (typeof value !== 'boolean') {
        throw new BadRequestException(`"${definition.key}" must be true or false.`);
      }
      return value;
    case 'SELECT': {
      const options = Array.isArray(definition.options) ? definition.options.map(String) : [];
      if (typeof value !== 'string' || !options.includes(value)) {
        throw new BadRequestException(`"${definition.key}" must be one of the listed options.`);
      }
      return value;
    }
    default:
      throw new BadRequestException(`"${definition.key}" has an unsupported type.`);
  }
}
