import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createUserSchema,
  updateUserSchema,
  UserRole,
  type CreateUserInput,
  type UpdateUserInput,
} from '@lojistik/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserInput) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserInput,
  ) {
    return this.usersService.update(id, dto);
  }
}
