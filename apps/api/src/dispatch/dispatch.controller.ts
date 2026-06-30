import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createDispatchSchema,
  addDispatchPackageSchema,
  bulkAddDispatchPackagesSchema,
  quickDispatchSchema,
  dispatchListQuerySchema,
  type CreateDispatchInput,
  type AddDispatchPackageInput,
  type BulkAddDispatchPackagesInput,
  type QuickDispatchInput,
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

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.dispatchService.cancel(id, user.id);
  }
}
