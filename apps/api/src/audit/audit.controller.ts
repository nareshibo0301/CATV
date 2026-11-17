import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  entity: z.string().trim().max(80).optional(),
  action: z.string().trim().max(80).optional(),
  q: z.string().trim().max(100).optional(),
});

@ApiTags('Audit')
@ApiCookieAuth()
@Roles('ADMIN')
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query(new ZodPipe(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>) {
    const where = {
      entity: query.entity || undefined,
      action: query.action || undefined,
      ...(query.q
        ? {
            OR: [
              { entityId: { contains: query.q, mode: 'insensitive' as const } },
              { action: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
        actor: row.actor,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
