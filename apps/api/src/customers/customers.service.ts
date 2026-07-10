import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination';
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  PaginationQuery,
  CreateCustomerLocationInput,
  CreateCustomerRecipientInput,
  CreateCustomerContactInput,
} from '@lojistik/shared';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationQuery) {
    const { page, pageSize, search } = query;
    const where: Prisma.CustomerWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Müşteri bulunamadı');
    return customer;
  }

  async create(input: CreateCustomerInput) {
    const base = this.normalize(input);

    // Elle kod verildiyse onu kullan
    if (base.code) {
      await this.ensureCodeFree(base.code);
      return this.prisma.customer.create({ data: { ...base, code: base.code } });
    }

    // Aksi halde otomatik sıralı kod (MST0001...) — çakışmada yeniden dener
    let lastErr: unknown;
    for (let i = 0; i < 5; i++) {
      const code = await this.nextCustomerCode();
      try {
        return await this.prisma.customer.create({ data: { ...base, code } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  /** Sıradaki otomatik müşteri kodu: MST0001, MST0002 ... */
  private async nextCustomerCode(): Promise<string> {
    const rows = await this.prisma.customer.findMany({
      where: { code: { startsWith: 'MST' } },
      select: { code: true },
    });
    let max = 0;
    for (const { code } of rows) {
      const m = /^MST(\d+)$/.exec(code);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `MST${String(max + 1).padStart(4, '0')}`;
  }

  async update(id: string, input: UpdateCustomerInput) {
    await this.findOne(id);
    if (input.code) await this.ensureCodeFree(input.code, id);
    return this.prisma.customer.update({ where: { id }, data: this.normalize(input) });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.customer.delete({ where: { id } });
    return { success: true };
  }

  // ---- Müşteri kaynak depoları ----

  async listLocations(customerId: string) {
    await this.findOne(customerId);
    return this.prisma.customerLocation.findMany({
      where: { customerId },
      orderBy: { name: 'asc' },
    });
  }

  async addLocation(customerId: string, input: CreateCustomerLocationInput) {
    await this.findOne(customerId);
    return this.prisma.customerLocation.create({ data: { customerId, ...input } });
  }

  async updateLocation(
    customerId: string,
    locationId: string,
    input: CreateCustomerLocationInput,
  ) {
    await this.prisma.customerLocation.updateMany({
      where: { id: locationId, customerId },
      data: input,
    });
    return this.prisma.customerLocation.findUnique({ where: { id: locationId } });
  }

  async removeLocation(customerId: string, locationId: string) {
    await this.prisma.customerLocation.deleteMany({ where: { id: locationId, customerId } });
    return { success: true };
  }

  // ---- Müşteri alıcıları (firmanın kendi müşterileri) ----

  async listRecipients(customerId: string) {
    await this.findOne(customerId);
    return this.prisma.customerRecipient.findMany({
      where: { customerId },
      orderBy: { name: 'asc' },
    });
  }

  async addRecipient(customerId: string, input: CreateCustomerRecipientInput) {
    await this.findOne(customerId);
    return this.prisma.customerRecipient.create({ data: { customerId, ...input } });
  }

  async updateRecipient(
    customerId: string,
    recipientId: string,
    input: CreateCustomerRecipientInput,
  ) {
    await this.prisma.customerRecipient.updateMany({
      where: { id: recipientId, customerId },
      data: input,
    });
    return this.prisma.customerRecipient.findUnique({ where: { id: recipientId } });
  }

  async removeRecipient(customerId: string, recipientId: string) {
    await this.prisma.customerRecipient.deleteMany({ where: { id: recipientId, customerId } });
    return { success: true };
  }

  // ---- Müşteri yetkilileri (çoklu kişi) ----

  async listContacts(customerId: string) {
    await this.findOne(customerId);
    return this.prisma.customerContact.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addContact(customerId: string, input: CreateCustomerContactInput) {
    await this.findOne(customerId);
    return this.prisma.customerContact.create({ data: { customerId, ...this.normalize(input) } });
  }

  async updateContact(customerId: string, contactId: string, input: CreateCustomerContactInput) {
    await this.prisma.customerContact.updateMany({
      where: { id: contactId, customerId },
      data: this.normalize(input),
    });
    return this.prisma.customerContact.findUnique({ where: { id: contactId } });
  }

  async removeContact(customerId: string, contactId: string) {
    await this.prisma.customerContact.deleteMany({ where: { id: contactId, customerId } });
    return { success: true };
  }

  private normalize<T extends { email?: string }>(input: T): T {
    // Boş e-posta stringini null'a çevir
    if (input.email === '') return { ...input, email: undefined };
    return input;
  }

  private async ensureCodeFree(code: string, ignoreId?: string) {
    const found = await this.prisma.customer.findUnique({ where: { code } });
    if (found && found.id !== ignoreId) {
      throw new ConflictException('Bu müşteri kodu zaten kullanılıyor');
    }
  }
}
