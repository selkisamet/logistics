import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  createLocationSchema,
  UserRole,
  type CreateWarehouseInput,
  type UpdateWarehouseInput,
  type CreateLocationInput,
} from '@lojistik/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { WarehousesService } from './warehouses.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  findAll() {
    return this.warehousesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Post()
  create(@Body(new ZodValidationPipe(createWarehouseSchema)) dto: CreateWarehouseInput) {
    return this.warehousesService.create(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWarehouseSchema)) dto: UpdateWarehouseInput,
  ) {
    return this.warehousesService.update(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Post(':id/default')
  setDefault(@Param('id') id: string) {
    return this.warehousesService.setDefault(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Post('locations')
  addLocation(@Body(new ZodValidationPipe(createLocationSchema)) dto: CreateLocationInput) {
    return this.warehousesService.addLocation(dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.warehousesService.remove(id);
  }
}
