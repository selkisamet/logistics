import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createPickupTaskSchema,
  pickupTaskListQuerySchema,
  updatePickupTaskSchema,
  UserRole,
  type AuthUser,
  type CreatePickupTaskInput,
  type PickupTaskListQuery,
  type UpdatePickupTaskInput,
} from '@lojistik/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PickupTasksService } from './pickup-tasks.service';

// Okuma herkese açık (depocu yoldaki araçları görür); açma/düzenleme/iptal yönetici
// ve sevkiyat müdürü (SUPERVISOR) — aracı onlar görevlendiriyor.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pickup-tasks')
export class PickupTasksController {
  constructor(private readonly service: PickupTasksService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(pickupTaskListQuerySchema)) query: PickupTaskListQuery) {
    return this.service.findAll(query);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Post()
  create(
    @Body(new ZodValidationPipe(createPickupTaskSchema)) dto: CreatePickupTaskInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user.id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePickupTaskSchema)) dto: UpdatePickupTaskInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancel(id, user.id);
  }
}
