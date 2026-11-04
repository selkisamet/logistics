import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRegionInput, UpdateRegionInput } from '@lojistik/shared';

const REGION_SELECT = { id: true, name: true, sortOrder: true, isActive: true } as const;

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sıra: elle verilen `sortOrder`, eşitse ada göre. Pasifler en sonda. */
  findAll() {
    return this.prisma.region.findMany({
      select: REGION_SELECT,
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(input: CreateRegionInput) {
    await this.ensureNameFree(input.name);
    return this.prisma.region.create({ data: input, select: REGION_SELECT });
  }

  async update(id: string, input: UpdateRegionInput) {
    await this.getOrThrow(id);
    if (input.name) await this.ensureNameFree(input.name, id);
    return this.prisma.region.update({ where: { id }, data: input, select: REGION_SELECT });
  }

  /**
   * Kullanılmış bölge SİLİNMEZ — silinseydi o bölgedeki mallar sessizce BEKLEYEN'e
   * düşerdi (FK SET NULL) ve depocu yanlış yerde arardı. Pasife alınır.
   */
  async remove(id: string) {
    await this.getOrThrow(id);
    const [receipts, tasks] = await Promise.all([
      this.prisma.receipt.count({ where: { OR: [{ regionId: id }, { storedRegionId: id }] } }),
      this.prisma.pickupTask.count({ where: { regionId: id } }),
    ]);
    if (receipts + tasks > 0) {
      throw new ConflictException('Bu bölge kullanılmış, silinemez — pasife alabilirsiniz');
    }
    await this.prisma.region.delete({ where: { id } });
    return { success: true };
  }

  private async getOrThrow(id: string) {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException('Bölge bulunamadı');
    return region;
  }

  private async ensureNameFree(name: string, ignoreId?: string) {
    const found = await this.prisma.region.findUnique({ where: { name } });
    if (found && found.id !== ignoreId) throw new ConflictException('Bu bölge zaten var');
  }
}
