import { Global, Injectable, Module } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLog, CodeSequence } from '../operations/operations.entities';
import { AuthUser } from './auth.decorators';
import { BusinessRulesConfig } from './business-rules.config';

/** Sinh mã nghiệp vụ tăng dần, an toàn khi nhiều người thao tác cùng lúc. */
@Injectable()
export class CodeService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async next(prefix: string, manager?: EntityManager, pad = 5): Promise<string> {
    const m = manager ?? this.ds.manager;
    const rows = await m.query(
      `INSERT INTO code_sequences(prefix, value) VALUES ($1, 1)
       ON CONFLICT (prefix) DO UPDATE SET value = code_sequences.value + 1 RETURNING value`,
      [prefix],
    );
    return `${prefix}-${String(rows[0].value).padStart(pad, '0')}`;
  }
}

/** Ghi nhật ký thao tác quan trọng (thay đổi giá, hoa hồng, hủy hóa đơn, no-show...). */
@Injectable()
export class AuditService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async log(
    user: AuthUser | null,
    action: string,
    entity: string,
    entityId: string | number | null,
    summary: string,
    before?: unknown,
    after?: unknown,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = (manager ?? this.ds.manager).getRepository(AuditLog);
    await repo.save(
      repo.create({
        actor: user ? ({ id: user.accountId } as any) : null,
        actorName: user?.name ?? 'Hệ thống',
        action,
        entity,
        entityId: entityId == null ? null : String(entityId),
        summary,
        before: before ?? null,
        after: after ?? null,
      }),
    );
  }
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, CodeSequence])],
  providers: [CodeService, AuditService, BusinessRulesConfig],
  exports: [CodeService, AuditService, BusinessRulesConfig],
})
export class SharedModule {}
