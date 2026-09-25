import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  startReceiptSchema,
  upsertReceiptLineSchema,
  createPackageSchema,
  updateReceiptSchema,
  updateReceiptCommercialSchema,
  editReceiptLineSchema,
  receiptListQuerySchema,
  UserRole,
  type StartReceiptInput,
  type UpsertReceiptLineInput,
  type CreatePackageInput,
  type UpdateReceiptInput,
  type UpdateReceiptCommercialInput,
  type EditReceiptLineInput,
  type ReceiptListQuery,
  type AuthUser,
} from '@lojistik/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { imageUploadOptions } from '../common/upload';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReceiptsService } from './receipts.service';

// RolesGuard eklendi: @Roles taşımayan uçlar etkilenmez (guard boş listede geçer),
// yalnız ticari alanlar yönetici/şef'e kısıtlanır.
@UseGuards(JwtAuthGuard, RolesGuard)
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

  /** Denetim izi — "Geçmiş" kartı bunu okur. */
  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.receiptsService.history(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateReceiptSchema)) dto: UpdateReceiptInput,
  ) {
    return this.receiptsService.update(id, dto);
  }

  /** Ticari/taraf bilgileri — depocu değil OFİS doldurur. */
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Patch(':id/commercial')
  updateCommercial(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateReceiptCommercialSchema)) dto: UpdateReceiptCommercialInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.receiptsService.updateCommercial(id, dto, user.id);
  }

  @Patch(':id/lines')
  upsertLine(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertReceiptLineSchema)) dto: UpsertReceiptLineInput,
  ) {
    return this.receiptsService.upsertLine(id, dto);
  }

  /** Kalemin ticari alanları (fiyat, kilo, cins) — depocu değil OFİS doldurur. */
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Patch(':id/lines/:lineId')
  updateLineCommercial(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body(new ZodValidationPipe(editReceiptLineSchema)) dto: EditReceiptLineInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.receiptsService.updateLineCommercial(id, lineId, dto, user.id);
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

  /** İrsaliye/belge görüntüleri (foto) — çoklu yükle + mal kabule bağla. */
  @Post(':id/attachments')
  @UseInterceptors(FilesInterceptor('files', 12, imageUploadOptions))
  addAttachments(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.receiptsService.addAttachments(id, files);
  }

  @Delete(':id/attachments/:attachmentId')
  removeAttachment(@Param('id') id: string, @Param('attachmentId') attachmentId: string) {
    return this.receiptsService.removeAttachment(id, attachmentId);
  }
}
