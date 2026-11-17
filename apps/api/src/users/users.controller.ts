import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { createUserSchema, updateUserSchema, userListQuerySchema, type AuthUser } from '@catv/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { RequireScopes } from '../rbac/scopes.decorator';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiCookieAuth()
@Roles('ADMIN', 'DISTRIBUTOR', 'OPERATOR')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequireScopes('users:read')
  list(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodPipe(userListQuerySchema)) query: ReturnType<typeof userListQuerySchema.parse>,
    ) {
    return this.users.list(actor, query);
  }

  @Get(':id')
  @RequireScopes('users:read')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(actor, id);
  }

  @Post()
  @RequireScopes('users:write')
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodPipe(createUserSchema)) body: ReturnType<typeof createUserSchema.parse>,
    @Req() req: Request,
  ) {
    return this.users.create(actor, body, req.ip ?? null);
  }

  @Patch(':id')
  @RequireScopes('users:write')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateUserSchema)) body: ReturnType<typeof updateUserSchema.parse>,
    @Req() req: Request,
  ) {
    return this.users.update(actor, id, body, req.ip ?? null);
  }

  @Post(':id/suspend')
  suspend(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.users.setStatus(actor, id, 'SUSPENDED', req.ip ?? null);
  }

  @Post(':id/reactivate')
  reactivate(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.users.setStatus(actor, id, 'ACTIVE', req.ip ?? null);
  }

  @Delete(':id')
  remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.users.remove(actor, id, req.ip ?? null);
  }
}
