import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Các tham số quy tắc nghiệp vụ, đọc từ biến môi trường (xem .env.example). */
@Injectable()
export class BusinessRulesConfig {
  readonly openTime: string;
  readonly closeTime: string;
  readonly slotMinutes: number;
  readonly cancelLockHours: number;
  readonly graceMinutes: number;
  readonly noShowDepositThreshold: number;
  readonly depositMinDuration: number;
  readonly allowNegativeStock: boolean;

  constructor(config: ConfigService) {
    this.openTime = config.get('OPEN_TIME', '08:00');
    this.closeTime = config.get('CLOSE_TIME', '20:00');
    this.slotMinutes = Number(config.get('SLOT_MINUTES', 30));
    this.cancelLockHours = Number(config.get('CANCEL_LOCK_HOURS', 2));
    this.graceMinutes = Number(config.get('GRACE_MINUTES', 15));
    this.noShowDepositThreshold = Number(config.get('NO_SHOW_DEPOSIT_THRESHOLD', 2));
    this.depositMinDuration = Number(config.get('DEPOSIT_MIN_DURATION', 90));
    this.allowNegativeStock = String(config.get('ALLOW_NEGATIVE_STOCK', 'false')) === 'true';
  }
}
