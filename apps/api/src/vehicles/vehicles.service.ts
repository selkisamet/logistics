import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateVehicleInput, UpdateVehicleInput } from '@lojistik/shared';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.vehicle.findMany({ orderBy: { plate: 'asc' } });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('Araç bulunamadı');
    return vehicle;
  }

  async create(input: CreateVehicleInput) {
    const plate = normalizePlate(input.plate);
    await this.ensurePlateFree(plate);
    return this.prisma.vehicle.create({
      data: { ...input, plate, trailerPlate: normalizeOpt(input.trailerPlate) },
    });
  }

  async update(id: string, input: UpdateVehicleInput) {
    await this.findOne(id);
    const plate = input.plate ? normalizePlate(input.plate) : undefined;
    if (plate) await this.ensurePlateFree(plate, id);
    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...input,
        ...(plate ? { plate } : {}),
        ...(input.trailerPlate !== undefined
          ? { trailerPlate: normalizeOpt(input.trailerPlate) }
          : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.vehicle.delete({ where: { id } });
    return { success: true };
  }

  private async ensurePlateFree(plate: string, ignoreId?: string) {
    const found = await this.prisma.vehicle.findUnique({ where: { plate } });
    if (found && found.id !== ignoreId) {
      throw new ConflictException('Bu plaka zaten kayıtlı');
    }
  }
}

function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s+/g, ' ');
}
function normalizeOpt(v?: string): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t ? t.toUpperCase().replace(/\s+/g, ' ') : undefined;
}
