import { Body, Controller, Get, Module, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, NotEquals } from 'class-validator';
import { CommissionLine, Invoice, InvoiceItem, Payment, Promotion } from './billing.entities';
import { BillingService } from './billing.service';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { InvoiceStatus, PaymentMethod, PromotionType, Role } from '../common/enums';
import { vnDateString } from '../common/time';

export class AddProductDto {
  @IsInt() productId: number;
  @IsInt() @Min(1) quantity: number;
}

export class PayDto {
  @IsIn([PaymentMethod.CASH, PaymentMethod.TRANSFER]) method: PaymentMethod;
  @IsInt() @Min(1) amount: number;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsBoolean() confirmed?: boolean;
}

export class ReasonDto {
  @IsString() @IsNotEmpty() reason: string;
  /** Hủy hóa đơn đã thu tiền: xác nhận đã hoàn tiền cho khách. */
  @IsOptional() @IsBoolean() refund?: boolean;
}

export class AdjustmentDto {
  @IsString() @IsNotEmpty() description: string;
  /** Âm = giảm giá, dương = phụ thu (VND). */
  @IsInt() @NotEquals(0) amount: number;
}

export class ResolvePaymentDto {
  @IsBoolean() success: boolean;
}

export class PromotionDto {
  @IsString() name: string;
  @IsEnum(PromotionType) type: PromotionType;
  @IsInt() @Min(0) value: number;
  @IsOptional() @IsBoolean() memberOnly?: boolean;
  @IsOptional() @IsBoolean() firstVisitOnly?: boolean;
  @IsOptional() @IsString() serviceCategory?: string | null;
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() endDate?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePromotionDto extends PartialType(PromotionDto) {}

const DESK = [Role.OWNER, Role.RECEPTIONIST];

function monthRange(month?: string) {
  const m = month ?? vnDateString(new Date()).slice(0, 7);
  const [y, mm] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` };
}

@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Roles(...DESK) @Get('invoices')
  list(@Query('date') date?: string, @Query('status') status?: InvoiceStatus) {
    return this.svc.list(date, status);
  }

  @Roles(...DESK) @Get('invoices/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
  }

  @Roles(...DESK) @Post('sessions/:sessionId/invoice')
  fromSession(@Param('sessionId', ParseIntPipe) sessionId: number, @CurrentUser() u: AuthUser) {
    return this.svc.createFromSession(sessionId, u);
  }

  @Roles(...DESK) @Post('invoices/:id/products')
  addProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: AddProductDto, @CurrentUser() u: AuthUser) {
    return this.svc.addProduct(id, dto.productId, dto.quantity, u);
  }

  @Roles(...DESK) @Post('invoices/:id/adjustments')
  adjust(@Param('id', ParseIntPipe) id: number, @Body() dto: AdjustmentDto, @CurrentUser() u: AuthUser) {
    return this.svc.addAdjustment(id, dto, u);
  }

  @Roles(...DESK) @Post('invoices/:id/items/:itemId/remove')
  removeItem(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @CurrentUser() u: AuthUser) {
    return this.svc.removeItem(id, itemId, u);
  }

  @Roles(...DESK) @Post('invoices/:id/submit')
  submit(@Param('id', ParseIntPipe) id: number) {
    return this.svc.submit(id);
  }

  @Roles(...DESK) @Post('invoices/:id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: ReasonDto, @CurrentUser() u: AuthUser) {
    return this.svc.cancel(id, dto.reason, u, dto.refund === true);
  }

  @Roles(...DESK) @Post('invoices/:id/payments')
  pay(@Param('id', ParseIntPipe) id: number, @Body() dto: PayDto, @CurrentUser() u: AuthUser) {
    return this.svc.pay(id, dto, u);
  }

  @Roles(...DESK) @Post('payments/:id/resolve')
  resolve(@Param('id', ParseIntPipe) id: number, @Body() dto: ResolvePaymentDto, @CurrentUser() u: AuthUser) {
    return this.svc.resolvePayment(id, dto.success, u);
  }

  /** Hoa hồng cá nhân (stylist/thợ phụ) theo tháng "YYYY-MM". */
  @Roles(Role.STYLIST, Role.ASSISTANT, Role.RECEPTIONIST, Role.OWNER) @Get('commissions/mine')
  mine(@CurrentUser() u: AuthUser, @Query('month') month?: string) {
    const r = monthRange(month);
    return this.svc.commissionsOf(u.employeeId!, r.from, r.to);
  }

  @Roles(Role.OWNER) @Get('commissions/:employeeId')
  ofEmployee(@Param('employeeId', ParseIntPipe) id: number, @Query('month') month?: string) {
    const r = monthRange(month);
    return this.svc.commissionsOf(id, r.from, r.to);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Get('promotions')
  promotions() {
    return this.svc.listPromotions();
  }

  @Roles(Role.OWNER) @Post('promotions')
  createPromotion(@Body() dto: PromotionDto, @CurrentUser() u: AuthUser) {
    return this.svc.savePromotion(dto, u);
  }

  @Roles(Role.OWNER) @Patch('promotions/:id')
  updatePromotion(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePromotionDto, @CurrentUser() u: AuthUser) {
    return this.svc.savePromotion(dto, u, id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, InvoiceItem, Payment, Promotion, CommissionLine])],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
