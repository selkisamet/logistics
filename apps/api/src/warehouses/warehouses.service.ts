import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateWarehouseInput,
  UpdateWarehouseInput,
  CreateLocationInput,
} from '@lojistik/shared';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { locations: { orderBy: { code: 'asc' } } },
    });
    if (!warehouse) throw new NotFoundException('Depo bulunamadı');
    return warehouse;
  }

  async create(input: CreateWarehouseInput) {
    // Elle kod verildiyse onu kullan
    if (input.code) {
      await this.ensureCodeFree(input.code);
      return this.prisma.warehouse.create({ data: { ...input, code: input.code } });
    }

    // Aksi halde addan otomatik kod üret; çakışırsa _2, _3...
    const baseSlug = this.slugify(input.name) || 'DEPO';
    for (let i = 0; i < 50; i++) {
      const code = i === 0 ? baseSlug : `${baseSlug}_${i + 1}`;
      const exists = await this.prisma.warehouse.findUnique({ where: { code } });
      if (exists) continue;
      try {
        return await this.prisma.warehouse.create({ data: { ...input, code } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    throw new ConflictException('Depo kodu üretilemedi, lütfen elle bir kod verin');
  }

  /** Addan okunur kod üretir: "Merkez Depo" -> "MERKEZ_DEPO" */
  private slugify(name: string): string {
    const map: Record<string, string> = {
      ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
      ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
    };
    return name
      .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => map[c] ?? c)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
  }

  async update(id: string, input: UpdateWarehouseInput) {
    await this.findOne(id);
    if (input.code) await this.ensureCodeFree(input.code, id);
    return this.prisma.warehouse.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.warehouse.delete({ where: { id } });
    return { success: true };
  }

  /** Bu depoyu varsayılan yapar; diğerlerinin varsayılanını kaldırır. */
  async setDefault(id: string) {
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
      this.prisma.warehouse.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return this.prisma.warehouse.findUnique({ where: { id } });
  }

  async addLocation(input: CreateLocationInput) {
    await this.findOne(input.warehouseId);
    return this.prisma.location.create({ data: input });
  }

  private async ensureCodeFree(code: string, ignoreId?: string) {
    const found = await this.prisma.warehouse.findUnique({ where: { code } });
    if (found && found.id !== ignoreId) {
      throw new ConflictException('Bu depo kodu zaten kullanılıyor');
    }
  }
}
