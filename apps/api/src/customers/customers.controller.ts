import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createCustomerSchema,
  updateCustomerSchema,
  createCustomerLocationSchema,
  paginationQuerySchema,
  UserRole,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type CreateCustomerLocationInput,
  type PaginationQuery,
} from '@lojistik/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CustomersService } from './customers.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Post()
  create(@Body(new ZodValidationPipe(createCustomerSchema)) dto: CreateCustomerInput) {
    return this.customersService.create(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) dto: UpdateCustomerInput,
  ) {
    return this.customersService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }

  // ---- Kaynak depolar ----

  @Get(':id/locations')
  findLocations(@Param('id') id: string) {
    return this.customersService.listLocations(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Post(':id/locations')
  addLocation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCustomerLocationSchema)) dto: CreateCustomerLocationInput,
  ) {
    return this.customersService.addLocation(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Delete(':id/locations/:locationId')
  removeLocation(@Param('id') id: string, @Param('locationId') locationId: string) {
    return this.customersService.removeLocation(id, locationId);
  }
}
