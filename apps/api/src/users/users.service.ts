import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import type { AuthUser, CreateUserInput, UpdateUserInput, UserListQuery } from '@catv/shared';
import { AuditService } from '../audit/audit.service';
import { DataScopeService } from '../access/data-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateCustomData, type DefinitionRule } from '../attributes/custom-data';
import { UserCodeService } from './user-code.service';
import { WEBHOOK_QUEUE } from '../network/queues';
import { planUserCreate } from './user-policy';

const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const userSelect = {
  id: true,
  userCode: true,
  role: true,
  adminType: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  customData: true,
  createdAt: true,
  parent: { select: { id: true, name: true, userCode: true, role: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: DataScopeService,
    private readonly codes: UserCodeService,
    private readonly audit: AuditService,
    @Optional() @Inject(WEBHOOK_QUEUE) private readonly webhooks?: Queue,
  ) {}

  async list(actor: AuthUser, query: UserListQuery) {
    const where = await this.listWhere(actor, query);
    const orderBy = { [query.sort]: query.dir } as Prisma.UserOrderByWithRelationInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map(presentUser),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(actor: AuthUser, id: string) {
    await this.assertInScope(actor, id);
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return presentUser(user);
  }

  async create(actor: AuthUser, input: CreateUserInput, ip: string | null) {
    const plan = planUserCreate(actor, input);
    if (!plan.ok) {
      throw plan.status === 403 ? new ForbiddenException(plan.message) : new BadRequestException(plan.message);
    }

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const parent = await this.resolveParent(tx, actor, plan.parentId, plan.parentMustBe, plan.role);
        const customData =
          actor.role === 'ADMIN'
            ? validateCustomData(await this.definitionRules(tx), plan.role, null, input.customData ?? {})
            : {};
        const userCode = await this.codes.allocate(plan.role, tx);
        const created = await tx.user.create({
          data: {
            role: plan.role,
            userCode,
            name: input.name,
            email: input.email,
            phone: cleanPhone(input.phone),
            passwordHash: await argon2.hash(input.password, ARGON_OPTIONS),
            parentId: parent?.id ?? null,
            customData,
            status: 'ACTIVE',
          },
          select: userSelect,
        });
        if (plan.commissionRequired && input.commission) {
          await tx.commissionRule.create({
            data: {
              userId: created.id,
              type: input.commission.type,
              value: input.commission.value,
              createdById: actor.id,
            },
          });
        }
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'USER_CREATED',
            entity: 'User',
            entityId: created.id,
            after: publicAudit(created, input.commission),
            ip,
          },
          tx,
        );
        return presentUser(created);
      });
      await this.emit('user.created', { userId: user.id, role: user.role });
      return user;
    } catch (error) {
      throw mapWriteError(error);
    }
  }

  async update(actor: AuthUser, id: string, input: UpdateUserInput, ip: string | null) {
    await this.assertInScope(actor, id);
    if (input.customData && actor.role !== 'ADMIN') {
      throw new ForbiddenException('Only an admin can change custom attributes.');
    }
    const existing = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    let customData: Prisma.InputJsonValue | undefined;
    if (input.customData && actor.role === 'ADMIN') {
      const definitions = await this.definitionRules(this.prisma);
      customData = validateCustomData(
        definitions,
        existing.role,
        existing.id,
        input.customData,
      );
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone === undefined ? undefined : cleanPhone(input.phone),
          passwordHash: input.password ? await argon2.hash(input.password, ARGON_OPTIONS) : undefined,
          customData,
        },
        select: userSelect,
      });
      await this.audit.record({
        actorId: actor.id,
        action: 'USER_UPDATED',
        entity: 'User',
        entityId: id,
        before: { name: existing.name, email: existing.email, phone: existing.phone, customData: existing.customData },
        after: {
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          customData: updated.customData,
          passwordChanged: Boolean(input.password),
        },
        ip,
      });
      const presented = presentUser(updated);
      await this.emit('user.updated', { userId: presented.id });
      return presented;
    } catch (error) {
      throw mapWriteError(error);
    }
  }

  private async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.webhooks) return;
    await this.webhooks.add('event', { type, eventId: randomUUID(), payload });
  }

  async setStatus(actor: AuthUser, id: string, status: 'ACTIVE' | 'SUSPENDED', ip: string | null) {
    if (id === actor.id) {
      throw new BadRequestException('You cannot change your own access this way.');
    }
    await this.assertInScope(actor, id);
    const existing = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException('User not found.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id },
        data: { status },
        select: userSelect,
      });
      if (status === 'SUSPENDED') {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.record(
        {
          actorId: actor.id,
          action: status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
          entity: 'User',
          entityId: id,
          before: { status: existing.status },
          after: { status },
          ip,
        },
        tx,
      );
      return row;
    });
    return presentUser(updated);
  }

  async remove(actor: AuthUser, id: string, ip: string | null) {
    if (id === actor.id) {
      throw new BadRequestException('You cannot delete your own account.');
    }
    await this.assertInScope(actor, id);
    const existing = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException('User not found.');
    }
    const children = await this.prisma.user.count({ where: { parentId: id, deletedAt: null } });
    if (children > 0) {
      throw new BadRequestException('This user still has accounts under them.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'USER_DELETED',
          entity: 'User',
          entityId: id,
          before: { deletedAt: null, userCode: existing.userCode },
          after: { deletedAt: new Date().toISOString() },
          ip,
        },
        tx,
      );
    });
    return { ok: true };
  }

  private async listWhere(actor: AuthUser, query: UserListQuery): Promise<Prisma.UserWhereInput> {
    const resolved = await this.scope.resolve(actor);
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (resolved.kind === 'ids') {
      where.id = { in: resolved.ids };
    }
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.parentId) where.parentId = query.parentId;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q, mode: 'insensitive' } },
        { userCode: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.attributeKey && query.attributeValue) {
      const definition = await this.prisma.attributeDefinition.findFirst({
        where: { key: query.attributeKey, deletedAt: null },
      });
      const equals =
        definition?.dataType === 'NUMBER' && Number.isFinite(Number(query.attributeValue))
          ? Number(query.attributeValue)
          : definition?.dataType === 'BOOLEAN'
            ? query.attributeValue === 'true'
            : query.attributeValue;
      where.customData = { path: [query.attributeKey], equals };
    }
    return where;
  }

  private async assertInScope(actor: AuthUser, id: string): Promise<void> {
    const resolved = await this.scope.resolve(actor);
    if (resolved.kind === 'ids' && !resolved.ids.includes(id)) {
      throw new ForbiddenException('You do not have access to this user.');
    }
  }

  private async resolveParent(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    parentId: string | null,
    mode: 'self' | 'self-or-operator-in-subtree' | 'admin-choice',
    role: CreateUserInput['role'],
  ) {
    if (role === 'DISTRIBUTOR') {
      return null;
    }
    if (!parentId) {
      throw new BadRequestException('Choose who this user belongs to.');
    }
    const parent = await tx.user.findFirst({ where: { id: parentId, deletedAt: null } });
    if (!parent) {
      throw new BadRequestException('The selected parent does not exist.');
    }
    if (mode === 'self' && parent.id !== actor.id) {
      throw new ForbiddenException('You can only create users under your own account.');
    }
    if (mode === 'self-or-operator-in-subtree') {
      const resolved = await this.scope.resolve(actor);
      const allowed = resolved.kind === 'all' || resolved.ids.includes(parent.id);
      const parentOk = parent.id === actor.id || parent.role === 'OPERATOR';
      if (!allowed || !parentOk) {
        throw new ForbiddenException('That parent is outside your accounts.');
      }
    }
    if (mode === 'admin-choice') {
      if (role === 'OPERATOR' && parent.role !== 'ADMIN' && parent.role !== 'DISTRIBUTOR') {
        throw new BadRequestException('An operator belongs under an admin or a distributor.');
      }
      if (role === 'OPERATOR' && parent.role === 'ADMIN' && parent.id !== actor.id) {
        throw new BadRequestException('A direct operator is created under your own admin account.');
      }
      if (role === 'CUSTOMER' && parent.role !== 'DISTRIBUTOR' && parent.role !== 'OPERATOR') {
        throw new BadRequestException('A customer belongs under a distributor or an operator.');
      }
    }
    return parent;
  }

  private async definitionRules(db: PrismaService | Prisma.TransactionClient): Promise<DefinitionRule[]> {
    const rows = await db.attributeDefinition.findMany({ where: { deletedAt: null } });
    return rows.map((row) => ({
      key: row.key,
      dataType: row.dataType,
      options: row.options,
      required: row.required,
      applicableRoles: row.applicableRoles,
      targetUserId: row.targetUserId,
      deletedAt: row.deletedAt,
    }));
  }
}

function presentUser(user: UserRow) {
  return {
    id: user.id,
    userCode: user.userCode,
    role: user.role,
    adminType: user.adminType,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    customData: (user.customData ?? {}) as Record<string, unknown>,
    createdAt: user.createdAt.toISOString(),
    parent: user.parent,
  };
}

function publicAudit(
  user: UserRow,
  commission: CreateUserInput['commission'],
): Prisma.InputJsonValue {
  return {
    userCode: user.userCode,
    role: user.role,
    name: user.name,
    email: user.email,
    parentId: user.parent?.id ?? null,
    commission: commission ?? null,
  };
}

function cleanPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException('Email or phone is already in use.');
  }
  return error;
}
