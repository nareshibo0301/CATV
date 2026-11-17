import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AttributeDefinitionInput, AuthUser, Role } from '@catv/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(role?: Role) {
    const rows = await this.prisma.attributeDefinition.findMany({
      where: { deletedAt: null },
      orderBy: { label: 'asc' },
    });
    const filtered = role ? rows.filter((row) => !row.targetUserId && row.applicableRoles.includes(role)) : rows;
    return filtered.map(present);
  }

  async forUser(role: Role, userId: string) {
    const rows = await this.prisma.attributeDefinition.findMany({
      where: { deletedAt: null },
      orderBy: { label: 'asc' },
    });
    return rows
      .filter((row) => (row.targetUserId ? row.targetUserId === userId : row.applicableRoles.includes(role)))
      .map(present);
  }

  async create(actor: AuthUser, input: AttributeDefinitionInput, ip: string | null) {
    const data = await this.normalize(input);
    try {
      const created = await this.prisma.attributeDefinition.create({ data });
      await this.audit.record({
        actorId: actor.id,
        action: 'ATTRIBUTE_CREATED',
        entity: 'AttributeDefinition',
        entityId: created.id,
        after: present(created),
        ip,
      });
      return present(created);
    } catch (error) {
      throw mapConflict(error);
    }
  }

  async update(actor: AuthUser, id: string, input: AttributeDefinitionInput, ip: string | null) {
    const existing = await this.prisma.attributeDefinition.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException('Attribute not found.');
    }
    const data = await this.normalize(input);
    try {
      const updated = await this.prisma.attributeDefinition.update({ where: { id }, data });
      await this.audit.record({
        actorId: actor.id,
        action: 'ATTRIBUTE_UPDATED',
        entity: 'AttributeDefinition',
        entityId: id,
        before: present(existing),
        after: present(updated),
        ip,
      });
      return present(updated);
    } catch (error) {
      throw mapConflict(error);
    }
  }

  async remove(actor: AuthUser, id: string, ip: string | null) {
    const existing = await this.prisma.attributeDefinition.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException('Attribute not found.');
    }
    const deletedAt = new Date();
    await this.prisma.attributeDefinition.update({ where: { id }, data: { deletedAt } });
    await this.audit.record({
      actorId: actor.id,
      action: 'ATTRIBUTE_DELETED',
      entity: 'AttributeDefinition',
      entityId: id,
      before: present(existing),
      after: { deletedAt: deletedAt.toISOString() },
      ip,
    });
    return { ok: true };
  }

  private async normalize(input: AttributeDefinitionInput) {
    if (input.dataType === 'SELECT' && (!input.options || input.options.length === 0)) {
      throw new BadRequestException('A select attribute needs at least one option.');
    }
    let applicableRoles = input.applicableRoles;
    if (input.targetUserId) {
      const user = await this.prisma.user.findFirst({
        where: { id: input.targetUserId, deletedAt: null },
      });
      if (!user) {
        throw new BadRequestException('The selected user does not exist.');
      }
      applicableRoles = [user.role];
    } else if (applicableRoles.length === 0) {
      throw new BadRequestException('Choose at least one role, or one specific user.');
    }
    return {
      key: input.key,
      label: input.label,
      dataType: input.dataType,
      options: input.dataType === 'SELECT' ? (input.options ?? []) : Prisma.JsonNull,
      required: input.required,
      applicableRoles,
      targetUserId: input.targetUserId ?? null,
    };
  }
}

function present(row: {
  id: string;
  key: string;
  label: string;
  dataType: string;
  options: Prisma.JsonValue;
  required: boolean;
  applicableRoles: string[];
  targetUserId: string | null;
}) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    dataType: row.dataType,
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    required: row.required,
    applicableRoles: row.applicableRoles,
    targetUserId: row.targetUserId,
  };
}

function mapConflict(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException('An attribute with this key already exists.');
  }
  return error;
}
