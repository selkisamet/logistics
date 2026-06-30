import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangePasswordInput, LoginInput, LoginResponse } from '@lojistik/shared';
import type { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(input: LoginInput): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('E-posta veya şifre hatalı');
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('E-posta veya şifre hatalı');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);

    return {
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Oturum geçersiz');

    const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Mevcut şifre hatalı');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(input.newPassword, 10) },
    });
    return { success: true };
  }
}
