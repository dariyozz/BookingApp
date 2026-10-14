import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('public/slots')
  listPublicSlots(@Query('date') date?: string) {
    return this.appService.listPublicSlots(date);
  }

  @Post('public/bookings')
  createBooking(@Body() body: any) {
    return this.appService.createBooking(body);
  }

  @Post('ai/confirmation')
  generateConfirmation(@Body() body: any) {
    return this.appService.generateConfirmationMessage(body);
  }

  @Get('dashboard')
  listDashboard() {
    return this.appService.getDashboard();
  }

  @Get('host/slots')
  getHostSlots() {
    return this.appService.getHostSlots();
  }

  @Post('host/slots')
  createHostSlot(@Body() body: any) {
    const result = this.appService.createHostSlot(body);
    return result;
  }

  @Patch('host/slots/:slotId')
  updateHostSlot(@Param('slotId') slotId: string, @Body() body: any) {
    return this.appService.updateHostSlot(slotId, body);
  }

  @Delete('host/slots/:slotId')
  cancelHostSlot(@Param('slotId') slotId: string) {
    return this.appService.cancelHostSlot(slotId);
  }

  @Delete('host/bookings/:bookingId')
  cancelBooking(@Param('bookingId') bookingId: string) {
    return this.appService.cancelBooking(bookingId);
  }
}
