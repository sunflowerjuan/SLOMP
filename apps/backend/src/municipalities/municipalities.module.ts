import { Module } from '@nestjs/common';
import { MunicipalitiesController } from './municipalities.controller.js';
import { MunicipalitiesService } from './municipalities.service.js';

@Module({
  controllers: [MunicipalitiesController],
  providers: [MunicipalitiesService],
})
export class MunicipalitiesModule {}
