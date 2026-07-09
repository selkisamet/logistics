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
  createCustomerRecipientSchema,
  paginationQuerySchema,
  UserRole,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type CreateCustomerLocationInput,
  type CreateCustomerRecipientInput,
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
  @Patch(':id/locations/:locationId')
  updateLocation(
    @Param('id') id: string,
    @Param('locationId') locationId: string,
    @Body(new ZodValidationPipe(createCustomerLocationSchema)) dto: CreateCustomerLocationInput,
  ) {
    return this.customersService.updateLocation(id, locationId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Delete(':id/locations/:locationId')
  removeLocation(@Param('id') id: string, @Param('locationId') locationId: string) {
    return this.customersService.removeLocation(id, locationId);
  }

  // ---- Alıcılar (firmanın kendi müşterileri) ----

  @Get(':id/recipients')
  findRecipients(@Param('id') id: string) {
    return this.customersService.listRecipients(id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Post(':id/recipients')
  addRecipient(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCustomerRecipientSchema)) dto: CreateCustomerRecipientInput,
  ) {
    return this.customersService.addRecipient(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Patch(':id/recipients/:recipientId')
  updateRecipient(
    @Param('id') id: string,
    @Param('recipientId') recipientId: string,
    @Body(new ZodValidationPipe(createCustomerRecipientSchema)) dto: CreateCustomerRecipientInput,
  ) {
    return this.customersService.updateRecipient(id, recipientId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  @Delete(':id/recipients/:recipientId')
  removeRecipient(@Param('id') id: string, @Param('recipientId') recipientId: string) {
    return this.customersService.removeRecipient(id, recipientId);
  }
}
