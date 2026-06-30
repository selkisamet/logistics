import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  loginSchema,
  changePasswordSchema,
  type LoginInput,
  type ChangePasswordInput,
  type AuthUser,
} from '@lojistik/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginInput) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordInput,
  ) {
    return this.authService.changePassword(user.id, dto);
  }
}
