import { Body, Controller, ForbiddenException, Get, Module, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Appointment, AppointmentItem, ClosedDay, WalkInQueueEntry } from './appointment.entities';
import { AppointmentsService } from './appointments.service';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { vnDateString } from '../common/time';
import { PHONE_MSG, PHONE_RE } from '../common/validation';
import { RateLimit } from '../common/rate-limit';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ContactDto {
  @IsString() fullName: string;
  @Matches(PHONE_RE, { message: PHONE_MSG }) phone: string;
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
  /** Lễ tân quyết định hoàn/không hoàn cọc; bỏ trống thì theo mốc khóa BR-18. */
  @IsOptional() @IsBoolean() refundDeposit?: boolean;
}

export class OverrunDto {
  @IsInt() @Min(5) @Max(240) minutes: number;
  /** false = chỉ xem lịch bị ảnh hưởng, chưa ghi. */
  @IsOptional() @IsBoolean() apply?: boolean;
}

export class QueueDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @Matches(PHONE_RE, { message: PHONE_MSG }) phone?: string;
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) serviceIds: number[];
  @IsOptional() @IsInt() stylistId?: number | null;
  @IsOptional() @IsString() note?: string;
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
  @Public() @RateLimit(30, 600) @Post()
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
  list(@CurrentUser() u: AuthUser, @Query('date') date?: string) {
    const d = date ?? vnDateString(new Date());
    // Thợ chỉ thấy lịch của chính mình (SRS §22).
    return u.role === Role.STYLIST || u.role === Role.ASSISTANT ? this.svc.listForEmployee(u.employeeId!, d) : this.svc.listByDate(d);
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
    return this.svc.cancel(id, dto.reason, u, dto.refundDeposit);
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

  /** Ca đang phục vụ kéo dài: xem/ghi giờ kết thúc mới và lịch kế tiếp bị ảnh hưởng. */
  @Roles(...STAFF_DESK, Role.STYLIST) @Post(':id/overrun')
  overrun(@Param('id', ParseIntPipe) id: number, @Body() dto: OverrunDto, @CurrentUser() u: AuthUser) {
    return this.svc.overrun(id, dto.minutes, dto.apply !== false, u);
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

@ApiTags('appointments')
@Controller('walk-in-queue')
export class WalkInQueueController {
  constructor(private readonly svc: AppointmentsService) {}

  @Roles(...STAFF_DESK) @Get()
  list() {
    return this.svc.queueList();
  }

  @Roles(...STAFF_DESK) @Post()
  add(@Body() dto: QueueDto, @CurrentUser() u: AuthUser) {
    return this.svc.queueAdd(dto, u);
  }

  @Roles(...STAFF_DESK) @Post(':id/call')
  call(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.queueCall(id, u);
  }

  @Roles(...STAFF_DESK) @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser) {
    return this.svc.queueCancel(id, u);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, AppointmentItem, WalkInQueueEntry, ClosedDay])],
  controllers: [AppointmentsController, WalkInController, WalkInQueueController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
