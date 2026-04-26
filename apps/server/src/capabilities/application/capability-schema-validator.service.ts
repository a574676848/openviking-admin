import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  CapabilityContract,
  CapabilitySchema,
} from '../domain/capability.types';

@Injectable()
export class CapabilitySchemaValidatorService {
  validateInput(
    contract: CapabilityContract,
    input: Record<string, unknown>,
  ): void {
    const errors: string[] = [];
    this.validateValue(contract.inputSchema, input, 'input', errors);

    if (errors.length > 0) {
      throw new BadRequestException({
        code: 'CAPABILITY_INVALID_INPUT',
        message: `Capability ${contract.id} 输入不合法: ${errors[0]}`,
      });
    }
  }

  validateOutput(
    contract: CapabilityContract,
    output: Record<string, unknown>,
  ): void {
    const errors: string[] = [];
    this.validateValue(contract.outputSchema, output, 'output', errors);

    if (errors.length > 0) {
      throw new InternalServerErrorException({
        code: 'CAPABILITY_DOWNSTREAM_ERROR',
        message: `Capability ${contract.id} 输出与契约不一致: ${errors[0]}`,
      });
    }
  }

  private validateValue(
    schema: CapabilitySchema,
    value: unknown,
    path: string,
    errors: string[],
  ): void {
    if (errors.length > 0) {
      return;
    }

    if (value === null) {
      if (schema.nullable) {
        return;
      }

      errors.push(`${path} 不能为空`);
      return;
    }

    switch (schema.type) {
      case 'object':
        this.validateObject(schema, value, path, errors);
        return;
      case 'array':
        this.validateArray(schema, value, path, errors);
        return;
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${path} 必须是 string`);
        }
        return;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push(`${path} 必须是有限 number`);
        }
        return;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${path} 必须是 boolean`);
        }
        return;
      default:
        errors.push(`${path} 使用了不支持的 schema 类型`);
    }
  }

  private validateObject(
    schema: CapabilitySchema,
    value: unknown,
    path: string,
    errors: string[],
  ): void {
    if (!this.isPlainObject(value)) {
      errors.push(`${path} 必须是 object`);
      return;
    }

    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record) || record[key] === undefined) {
        errors.push(`${path}.${key} 为必填项`);
        return;
      }
    }

    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (!(key in record) || record[key] === undefined) {
        continue;
      }
      this.validateValue(propertySchema, record[key], `${path}.${key}`, errors);
      if (errors.length > 0) {
        return;
      }
    }
  }

  private validateArray(
    schema: CapabilitySchema,
    value: unknown,
    path: string,
    errors: string[],
  ): void {
    if (!Array.isArray(value)) {
      errors.push(`${path} 必须是 array`);
      return;
    }

    if (!schema.items) {
      return;
    }

    value.forEach((item, index) => {
      this.validateValue(schema.items as CapabilitySchema, item, `${path}[${index}]`, errors);
    });
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
