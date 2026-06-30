import { Module } from '@nestjs/common';
import { AsnService } from './asn.service';
import { AsnController } from './asn.controller';

@Module({
  providers: [AsnService],
  controllers: [AsnController],
  exports: [AsnService],
})
export class AsnModule {}
