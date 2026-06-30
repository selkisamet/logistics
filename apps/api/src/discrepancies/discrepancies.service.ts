import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { attachmentUrl } from '../common/upload';
import type { CreateDiscrepancyInput } from '@lojistik/shared';

const DISCREPANCY_INCLUDE = {
  attachments: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class DiscrepanciesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Yüklenen foto dosyalarından (multer) ek kayıtları oluşturur (henüz tutanağa bağlı değil). */
  async createAttachments(files: Express.Multer.File[]) {
    if (!files || files.length === 0) throw new BadRequestException('Dosya bulunamadı');
    const created = await Promise.all(
      files.map((f) =>
        this.prisma.attachment.create({
          data: { url: attachmentUrl(f.filename), fileName: f.originalname, mimeType: f.mimetype },
        }),
      ),
    );
    return created;
  }

  async create(input: CreateDiscrepancyInput, userId: string) {
    const receipt = await this.prisma.receipt.findUnique({ where: { id: input.receiptId } });
    if (!receipt) throw new NotFoundException('Mal kabul kaydı bulunamadı');

    const discrepancy = await this.prisma.discrepancy.create({
      data: {
        receiptId: input.receiptId,
        receiptLineId: input.receiptLineId,
        type: input.type,
        qty: input.qty,
        description: input.description,
        createdById: userId,
      },
    });

    if (input.attachmentIds && input.attachmentIds.length > 0) {
      await this.prisma.attachment.updateMany({
        where: { id: { in: input.attachmentIds }, discrepancyId: null },
        data: { discrepancyId: discrepancy.id },
      });
    }

    return this.prisma.discrepancy.findUnique({
      where: { id: discrepancy.id },
      include: DISCREPANCY_INCLUDE,
    });
  }

  listForReceipt(receiptId: string) {
    return this.prisma.discrepancy.findMany({
      where: { receiptId },
      include: DISCREPANCY_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string) {
    await this.prisma.discrepancy.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Tutanak bulunamadı');
    });
    return { success: true };
  }
}
