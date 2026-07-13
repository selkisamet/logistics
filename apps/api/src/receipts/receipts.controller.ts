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
  startReceiptSchema,
  upsertReceiptLineSchema,
  createPackageSchema,
  updateReceiptSchema,
  receiptListQuerySchema,
  type StartReceiptInput,
  type UpsertReceiptLineInput,
  type CreatePackageInput,
  type UpdateReceiptInput,
  type ReceiptListQuery,
  type AuthUser,
} from '@lojistik/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReceiptsService } from './receipts.service';

@UseGuards(JwtAuthGuard)
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(receiptListQuerySchema)) query: ReceiptListQuery) {
    return this.receiptsService.findAll(query);
  }

  @Get('stock')
  findStock(@Query(new ZodValidationPipe(receiptListQuerySchema)) query: ReceiptListQuery) {
    return this.receiptsService.findStock(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.receiptsService.findOne(id);
  }

  @Post('start')
  start(
    @Body(new ZodValidationPipe(startReceiptSchema)) dto: StartReceiptInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.receiptsService.start(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateReceiptSchema)) dto: UpdateReceiptInput,
  ) {
    return this.receiptsService.update(id, dto);
  }

  @Patch(':id/lines')
  upsertLine(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertReceiptLineSchema)) dto: UpsertReceiptLineInput,
  ) {
    return this.receiptsService.upsertLine(id, dto);
  }

  @Delete(':id/lines/:lineId')
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.receiptsService.removeLine(id, lineId);
  }

  @Post(':id/packages')
  createPackage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createPackageSchema)) dto: CreatePackageInput,
  ) {
    return this.receiptsService.createPackage(id, dto);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.receiptsService.complete(id, user.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.receiptsService.cancel(id, user.id);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.receiptsService.reopen(id, user.id);
  }
}
