import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { attributeDefinitionSchema, ROLES, type AuthUser, type Role } from '@catv/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { AttributesService } from './attributes.service';

@ApiTags('Attributes')
@ApiCookieAuth()
@Controller('attributes')
export class AttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Get()
  @Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
  list(@Query('role') role?: string, @Query('userId') userId?: string) {
    if (userId && role && isRole(role)) {
      return this.attributes.forUser(role, userId);
    }
    return this.attributes.list(role && isRole(role) ? role : undefined);
  }

  @Post()
  @Roles('ADMIN')
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodPipe(attributeDefinitionSchema)) body: ReturnType<typeof attributeDefinitionSchema.parse>,
    @Req() req: Request,
  ) {
    return this.attributes.create(actor, body, req.ip ?? null);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(attributeDefinitionSchema)) body: ReturnType<typeof attributeDefinitionSchema.parse>,
    @Req() req: Request,
  ) {
    return this.attributes.update(actor, id, body, req.ip ?? null);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.attributes.remove(actor, id, req.ip ?? null);
  }
}

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
