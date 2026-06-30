import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserInput, UpdateUserInput } from '@lojistik/shared';

const PUBLIC_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({ select: PUBLIC_SELECT, orderBy: { createdAt: 'desc' } });
  }

  async create(input: CreateUserInput) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new ConflictException('Bu e-posta zaten kayıtlı');

    const passwordHash = await bcrypt.hash(input.password, 10);
    return this.prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        passwordHash,
      },
      select: PUBLIC_SELECT,
    });
  }

  async update(id: string, input: UpdateUserInput) {
    await this.ensureExists(id);
    const { password, ...rest } = input;
    return this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      },
      select: PUBLIC_SELECT,
    });
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');
  }
}
