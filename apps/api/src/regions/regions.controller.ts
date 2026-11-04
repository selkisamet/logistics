import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createRegionSchema,
  updateRegionSchema,
  UserRole,
  type CreateRegionInput,
  type UpdateRegionInput,
} from '@lojistik/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RegionsService } from './regions.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get()
  findAll() {
    return this.regionsService.findAll();
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Post()
  create(@Body(new ZodValidationPipe(createRegionSchema)) dto: CreateRegionInput) {
    return this.regionsService.create(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRegionSchema)) dto: UpdateRegionInput,
  ) {
    return this.regionsService.update(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.regionsService.remove(id);
  }
}
