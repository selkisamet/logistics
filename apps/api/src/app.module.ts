import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { AsnModule } from './asn/asn.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { DiscrepanciesModule } from './discrepancies/discrepancies.module';
import { OcrModule } from './ocr/ocr.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Monorepo kökündeki .env dosyasını da oku
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), '../../.env')],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    WarehousesModule,
    AsnModule,
    ReceiptsModule,
    DiscrepanciesModule,
    OcrModule,
    DispatchModule,
    VehiclesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
