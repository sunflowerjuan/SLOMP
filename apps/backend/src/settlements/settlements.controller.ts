import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { SettlementsService } from './settlements.service.js';

@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get('search')
  search(
    @Query('cadastralCode') cadastralCode?: string,
    @Query('owner') owner?: string,
    @Query('address') address?: string,
  ) {
    return this.settlementsService.search({ cadastralCode, owner, address });
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: unknown,
  ) {
    return this.settlementsService.changeStatus(id, status);
  }
}
