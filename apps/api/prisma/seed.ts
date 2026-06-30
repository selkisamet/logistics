import { config } from 'dotenv';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Env yükle (apps/api/.env ve monorepo kökü .env)
config();
config({ path: join(process.cwd(), '../../.env') });

const prisma = new PrismaClient();

/**
 * Üretime hazır minimal seed: yalnızca giriş hesapları.
 * Müşteri, depo ve diğer veriler uygulamadan (gerçek verilerle) girilir.
 */
async function main() {
  const adminEmail = 'admin@lojistik.local';
  const adminPassword = 'admin123';

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      fullName: 'Sistem Yöneticisi',
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(adminPassword, 10),
    },
  });

  await prisma.user.upsert({
    where: { email: 'operator@lojistik.local' },
    update: {},
    create: {
      email: 'operator@lojistik.local',
      fullName: 'Depo Operatörü',
      role: 'OPERATOR',
      passwordHash: await bcrypt.hash('operator123', 10),
    },
  });

  console.log('Seed tamam (yalnızca giriş hesapları):');
  console.log(`  Admin    : ${adminEmail} / ${adminPassword}`);
  console.log(`  Operator : operator@lojistik.local / operator123`);
  console.log('  (Müşteri ve depoları uygulamadan ekleyin.)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
