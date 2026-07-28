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
  createDispatchSchema,
  addDispatchPackageSchema,
  bulkAddDispatchPackagesSchema,
  quickDispatchSchema,
  changeDispatchVehicleSchema,
  createDispatchStopSchema,
  updateDispatchStopSchema,
  reorderStopsSchema,
  assignToStopSchema,
  updateWaybillSchema,
  dispatchListQuerySchema,
  type CreateDispatchInput,
  type AddDispatchPackageInput,
  type BulkAddDispatchPackagesInput,
  type QuickDispatchInput,
  type ChangeDispatchVehicleInput,
  type CreateDispatchStopInput,
  type UpdateDispatchStopInput,
  type ReorderStopsInput,
  type AssignToStopInput,
  type UpdateWaybillInput,
  type DispatchListQuery,
  type AuthUser,
} from '@lojistik/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DispatchService } from './dispatch.service';

@UseGuards(JwtAuthGuard)
@Controller('dispatches')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(dispatchListQuerySchema)) query: DispatchListQuery) {
    return this.dispatchService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.dispatchService.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createDispatchSchema)) dto: CreateDispatchInput) {
    return this.dispatchService.create(dto);
  }

  @Post('quick')
  quickDispatch(
    @Body(new ZodValidationPipe(quickDispatchSchema)) dto: QuickDispatchInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatchService.quickDispatch(dto, user.id);
  }

  @Post(':id/packages')
  addPackage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addDispatchPackageSchema)) dto: AddDispatchPackageInput,
  ) {
    return this.dispatchService.addPackage(id, dto);
  }

  @Post(':id/packages/bulk')
  addPackages(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(bulkAddDispatchPackagesSchema)) dto: BulkAddDispatchPackagesInput,
  ) {
    return this.dispatchService.addPackages(id, dto.packageIds);
  }

  @Delete(':id/packages/:packageId')
  removePackage(@Param('id') id: string, @Param('packageId') packageId: string) {
    return this.dispatchService.removePackage(id, packageId);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.dispatchService.complete(id, user.id);
  }

  @Patch(':id/vehicle')
  changeVehicle(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeDispatchVehicleSchema)) dto: ChangeDispatchVehicleInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatchService.changeVehicle(id, dto.vehicleId, user.id);
  }

  // ---- Duraklar (çok noktalı teslimat) ----
  // DİKKAT: 'reorder' ve 'suggest' rotaları ':stopId'den ÖNCE tanımlı olmalı.

  @Post(':id/stops')
  addStop(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createDispatchStopSchema)) dto: CreateDispatchStopInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatchService.addStop(id, dto, user.id);
  }

  @Post(':id/stops/suggest')
  suggestStops(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.dispatchService.suggestStops(id, user.id);
  }

  @Patch(':id/stops/reorder')
  reorderStops(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reorderStopsSchema)) dto: ReorderStopsInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatchService.reorderStops(id, dto.stopIds, user.id);
  }

  @Patch(':id/stops/:stopId')
  updateStop(
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @Body(new ZodValidationPipe(updateDispatchStopSchema)) dto: UpdateDispatchStopInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatchService.updateStop(id, stopId, dto, user.id);
  }

  @Delete(':id/stops/:stopId')
  removeStop(
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatchService.removeStop(id, stopId, user.id);
  }

  /** Palet/kabulleri durağa ata. stopId 'yok' ise atama kaldırılır. */
  @Patch(':id/stops/:stopId/assign')
  assignToStop(
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @Body(new ZodValidationPipe(assignToStopSchema)) dto: AssignToStopInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatchService.assignToStop(id, stopId === 'yok' ? null : stopId, dto, user.id);
  }

  @Post(':id/stops/:stopId/deliver')
  markDelivered(
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatchService.setStopDelivered(id, stopId, true, user.id);
  }

  @Delete(':id/stops/:stopId/deliver')
  unmarkDelivered(
    @Param('id') id: string,
    @Param('stopId') stopId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatchService.setStopDelivered(id, stopId, false, user.id);
  }

  /** Taşıma irsaliyesi: matbu belgenin seri/sıra no'su + taşıma ücreti. */
  @Patch(':id/waybill')
  updateWaybill(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWaybillSchema)) dto: UpdateWaybillInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatchService.updateWaybill(id, dto, user.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.dispatchService.cancel(id, user.id);
  }
}
