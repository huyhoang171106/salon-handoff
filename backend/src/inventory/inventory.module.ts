import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, NotEquals, ValidateNested } from 'class-validator';
import { DataSource } from 'typeorm';
import { InventoryTransaction, Product } from './inventory.entities';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { InventoryTxType, ProductKind, Role, STAFF_ROLES } from '../common/enums';
import { BusinessRuleError } from '../common/business.error';
import { BusinessRulesConfig } from '../common/business-rules.config';
import { AuditService, CodeService } from '../common/shared.services';

export class ProductDto {
  @IsString() sku: string;
  @IsString() name: string;
  @IsEnum(ProductKind) kind: ProductKind;
  @IsString() unit: string;
  @IsInt() @Min(0) price: number;
  @IsInt() @Min(0) minStock: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsInt() @Min(0) minStock?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ReceiptLineDto {
  @IsInt() productId: number;
  @IsInt() @Min(1) quantity: number;
  @IsInt() @Min(0) unitCost: number;
}

export class ReceiptDto {
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => ReceiptLineDto) lines: ReceiptLineDto[];
  @IsOptional() @IsString() note?: string;
}

export class MovementDto {
  @IsInt() productId: number;
  @IsEnum(InventoryTxType) type: InventoryTxType.USAGE | InventoryTxType.ADJUSTMENT | InventoryTxType.DAMAGE;
  /** Số lượng có dấu với ADJUSTMENT; số dương với USAGE/DAMAGE (sẽ được trừ). */
  @IsInt() @NotEquals(0) quantity: number;
  @IsString() note: string;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly rules: BusinessRulesConfig,
    private readonly codes: CodeService,
    private readonly audit: AuditService,
  ) {}

  list(kind?: ProductKind) {
    return this.ds.manager.find(Product, { where: kind ? { kind } : {}, order: { kind: 'ASC', name: 'ASC' } });
  }

  async lowStock() {
    const all = await this.ds.manager.find(Product, { where: { active: true } });
    return all.filter((p) => p.isLow());
  }

  create(dto: ProductDto) {
    return this.ds.manager.save(this.ds.manager.create(Product, dto));
  }

  async update(id: number, dto: UpdateProductDto, user: AuthUser) {
    const p = await this.ds.manager.findOneBy(Product, { id });
    if (!p) throw new NotFoundException('Không tìm thấy sản phẩm');
    const before = { price: p.price };
    Object.assign(p, dto);
    const saved = await this.ds.manager.save(p);
    if (dto.price != null && dto.price !== before.price) await this.audit.log(user, 'PRODUCT_PRICE', 'Product', id, `Giá "${p.name}" ${before.price} → ${dto.price}`);
    return saved;
  }

  /** Phiếu nhập kho (FR-18). */
  async receipt(dto: ReceiptDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      const ref = await this.codes.next('PN', m);
      const out: InventoryTransaction[] = [];
      for (const l of dto.lines) {
        await m.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [l.productId]);
        const p = await m.findOneBy(Product, { id: l.productId });
        if (!p) throw new NotFoundException('Không tìm thấy sản phẩm');
        p.stock += l.quantity;
        await m.save(p);
        out.push(await m.save(m.create(InventoryTransaction, { product: p, type: InventoryTxType.RECEIPT, quantity: l.quantity, stockAfter: p.stock, unitCost: l.unitCost, note: dto.note ?? null, reference: ref, recordedBy: user.employeeId ? ({ id: user.employeeId } as any) : null })));
      }
      return { reference: ref, transactions: out };
    });
  }

  /** Xuất dùng cho dịch vụ, điều chỉnh kiểm kê, hàng hỏng/hết hạn (ngoại lệ 15). */
  async movement(dto: MovementDto, user: AuthUser) {
    return this.ds.transaction(async (m) => {
      await m.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [dto.productId]);
      const p = await m.findOneBy(Product, { id: dto.productId });
      if (!p) throw new NotFoundException('Không tìm thấy sản phẩm');
      const delta = dto.type === InventoryTxType.ADJUSTMENT ? dto.quantity : -Math.abs(dto.quantity);
      if (!this.rules.allowNegativeStock && p.stock + delta < 0) throw new BusinessRuleError('BR-09', `Tồn kho "${p.name}" không đủ (còn ${p.stock})`);
      p.stock += delta;
      await m.save(p);
      const tx = await m.save(m.create(InventoryTransaction, { product: p, type: dto.type, quantity: delta, stockAfter: p.stock, unitCost: 0, note: dto.note, reference: null, recordedBy: user.employeeId ? ({ id: user.employeeId } as any) : null }));
      if (dto.type !== InventoryTxType.USAGE) await this.audit.log(user, 'INVENTORY_' + dto.type, 'Product', p.id, `${dto.type} "${p.name}" ${delta}: ${dto.note}`, null, null, m);
      return tx;
    });
  }

  transactions(productId?: number) {
    return this.ds.manager.find(InventoryTransaction, { where: productId ? { product: { id: productId } } : {}, order: { createdAt: 'DESC' }, take: 200 });
  }
}

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  @Roles(...STAFF_ROLES) @Get('products')
  list(@Query('kind') kind?: ProductKind) {
    return this.svc.list(kind);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Get('low-stock')
  low() {
    return this.svc.lowStock();
  }

  @Roles(Role.OWNER) @Post('products')
  create(@Body() dto: ProductDto) {
    return this.svc.create(dto);
  }

  @Roles(Role.OWNER) @Patch('products/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto, @CurrentUser() u: AuthUser) {
    return this.svc.update(id, dto, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Post('receipts')
  receipt(@Body() dto: ReceiptDto, @CurrentUser() u: AuthUser) {
    return this.svc.receipt(dto, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST, Role.STYLIST, Role.ASSISTANT) @Post('movements')
  movement(@Body() dto: MovementDto, @CurrentUser() u: AuthUser) {
    return this.svc.movement(dto, u);
  }

  @Roles(Role.OWNER, Role.RECEPTIONIST) @Get('transactions')
  transactions(@Query('productId') productId?: string) {
    return this.svc.transactions(productId ? Number(productId) : undefined);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Product, InventoryTransaction])],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
