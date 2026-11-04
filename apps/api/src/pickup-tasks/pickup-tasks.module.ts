import { Module } from '@nestjs/common';
import { PickupTasksService } from './pickup-tasks.service';
import { PickupTasksController } from './pickup-tasks.controller';

@Module({
  providers: [PickupTasksService],
  controllers: [PickupTasksController],
})
export class PickupTasksModule {}
