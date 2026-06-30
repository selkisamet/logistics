import { z } from 'zod';

/** CUID/UUID benzeri id'ler için gevşek doğrulama (Prisma cuid kullanır). */
export const idSchema = z.string().min(1, 'Geçersiz id');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
