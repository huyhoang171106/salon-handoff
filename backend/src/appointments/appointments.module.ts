import { Body, Controller, ForbiddenException, Get, Module, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsInt, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { Appointment, AppointmentItem } from './appointment.entities';
import { AppointmentsService } from './appointments.service';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { vnDateString } from '../common/time';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ContactDto {
  @IsString() fullName: string;
  @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại không hợp lệ' }) phone: string;
}

export class BookingDto {
  @IsDateString() date: string;
  @Matches(TIME) time: string;
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) serviceIds: number[];
  @IsOptional() @IsInt() stylistId?: number | null;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @ValidateNested() @Type(() => ContactDto) customer?: ContactDto;
}

export class RescheduleDto {
  @IsDateString() date: string;
  @Matches(TIME) time: string;
  @IsOptional() @IsInt() stylistId?: number | null;
  @IsOptional() @IsString() reason?: string;
}

export class CheckInDto {
  /** Khách muốn đổi stylist khi tới */
  @IsOptional() @IsInt() stylistId?: number | null;
}

export class CancelDto {
  @IsOptional() @IsString() reason?: string;
}

export class WalkInDto {
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) serviceIds: number[];
  @IsOptional() @IsInt() stylistId?: number | null;
  @IsOptional() @ValidateNested() @Type(() => ContactDto) customer?: ContactDto;
  @IsOptional() @IsString() walkInName?: string;
}

const STAFF_DESK = [Role.OWNER, Role.RECEPTIONIST];

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}

  /** GET /appointments/availability?date=2026-10-22&serviceIds=1,3&stylistId=2 */
  @Public() @Get('availability')
  availability(@Query('date') date: string, @Query('serviceIds') serviceIds: string, @Query('stylistId') stylistId?: string, @Query('excludeAppointmentId') exclude?: string) {
    return this.svc.availability(
      { date, serviceIds: (serviceIds ?? '').split(',').filter(Boolean).map(Number), stylistId: stylistId ? Number(stylistId) : null },
      exclude ? Number(exclude) : undefined,
    );
  }

  /** Đặt lịch: khách vãng lai (không đăng nhập), thành viên hoặc lễ tân. */
  @Public() @Post()
  create(@Body() dto: BookingDto, @CurrentUser() user: AuthUser | null) {
    return this.svc.create(dto, user);
  }

  @Roles(Role.CUSTOMER) @Get('mine')
  mine(@CurrentUser() u: AuthUser) {
    return this.svc.listForCustomer(u.customerId!);
  }

  @Roles(Role.STYLIST, Role.ASSISTANT) @Get('my-day')
  myDay(@CurrentUser() u: AuthUser, @Query('date') date?: string) {
    return this.svc.listForEmployee(u.employeeId!, date ?? vnDateString(new Date()));
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST, Role.ASSISTANT) @Get()
  list(@Query('date') date?: string) {
    return this.svc.listByDate(date ?? vnDateString(new Date()));
  }

  @Roles(...STAFF_DESK, Role.CUSTOMER) @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    const a = await this.svc.reload(id);
    if (u.role === Role.CUSTOMER && a.customer.id !== u.customerId) throw new ForbiddenException('Không phải lịch của bạn');
    return a;
  }

  @Roles(...STAFF_DESK) @Post(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.confirm(id, u);
  }

  @Roles(...STAFF_DESK) @Post(':id/deposit-paid')
  depositPaid(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.markDepositPaid(id, u);
  }

  @Roles(...STAFF_DESK, Role.CUSTOMER) @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelDto, @CurrentUser() u: AuthUser) {
    return this.svc.cancel(id, dto.reason, u);
  }

  @Roles(...STAFF_DESK, Role.CUSTOMER) @Post(':id/reschedule')
  reschedule(@Param('id', ParseIntPipe) id: number, @Body() dto: RescheduleDto, @CurrentUser() u: AuthUser) {
    return this.svc.reschedule(id, dto, u);
  }

  @Roles(...STAFF_DESK) @Post(':id/late')
  late(@Param('id', ParseIntPipe) id: number) {
    return this.svc.markLate(id);
  }

  @Roles(...STAFF_DESK) @Post(':id/no-show')
  noShow(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.noShow(id, u);
  }

  @Roles(...STAFF_DESK) @Post(':id/check-in')
  checkIn(@Param('id', ParseIntPipe) id: number, @Body() dto: CheckInDto, @CurrentUser() u: AuthUser) {
    return this.svc.checkIn(id, u, dto.stylistId);
  }

  @Roles(...STAFF_DESK) @Get(':id/stylist-options')
  stylistOptions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.stylistOptions(id);
  }
}

@ApiTags('appointments')
@Controller('walk-ins')
export class WalkInController {
  constructor(private readonly svc: AppointmentsService) {}

  @Roles(...STAFF_DESK) @Post()
  create(@Body() dto: WalkInDto, @CurrentUser() u: AuthUser) {
    return this.svc.walkIn(dto, u);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, AppointmentItem])],
  controllers: [AppointmentsController, WalkInController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
