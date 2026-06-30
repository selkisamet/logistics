import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createAsnSchema,
  updateAsnSchema,
  updateAsnVehicleSchema,
  asnListQuerySchema,
  UserRole,
  type CreateAsnInput,
  type UpdateAsnInput,
  type UpdateAsnVehicleInput,
  type AsnListQuery,
} from '@lojistik/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AsnService } from './asn.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('asn')
export class AsnController {
  constructor(private readonly asnService: AsnService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(asnListQuerySchema)) query: AsnListQuery) {
    return this.asnService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.asnService.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Post()
  create(@Body(new ZodValidationPipe(createAsnSchema)) dto: CreateAsnInput) {
    return this.asnService.create(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAsnSchema)) dto: UpdateAsnInput,
  ) {
    return this.asnService.update(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Patch(':id/vehicle')
  setVehicle(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAsnVehicleSchema)) dto: UpdateAsnVehicleInput,
  ) {
    return this.asnService.setVehicle(id, dto.vehicleId);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.asnService.cancel(id);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.asnService.remove(id);
  }
}
