import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  createDiscrepancySchema,
  UserRole,
  type CreateDiscrepancyInput,
  type AuthUser,
} from '@lojistik/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { imageUploadOptions } from '../common/upload';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { DiscrepanciesService } from './discrepancies.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DiscrepanciesController {
  constructor(private readonly discrepanciesService: DiscrepanciesService) {}

  /** Fotoğraf(lar) yükle → ek kayıtları döner (sonra tutanağa bağlanır). */
  @Post('attachments')
  @UseInterceptors(FilesInterceptor('files', 8, imageUploadOptions))
  uploadAttachments(@UploadedFiles() files: Express.Multer.File[]) {
    return this.discrepanciesService.createAttachments(files);
  }

  @Post('discrepancies')
  create(
    @Body(new ZodValidationPipe(createDiscrepancySchema)) dto: CreateDiscrepancyInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.discrepanciesService.create(dto, user.id);
  }

  @Get('receipts/:receiptId/discrepancies')
  listForReceipt(@Param('receiptId') receiptId: string) {
    return this.discrepanciesService.listForReceipt(receiptId);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Delete('discrepancies/:id')
  remove(@Param('id') id: string) {
    return this.discrepanciesService.remove(id);
  }
}
