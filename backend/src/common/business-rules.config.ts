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
  readonly reminderHours: number;
  readonly depositRate: number;
  readonly depositMinAmount: number;
  readonly depositHoldHours: number;
  readonly checkInEarlyMinutes: number;
  readonly maxOpenAppointments: number;
  readonly reminderWebhookUrl: string | null;
  readonly reminderWebhookToken: string | null;
  readonly salonName: string;
  readonly hotline: string;
  readonly address: string;

  constructor(config: ConfigService) {
    this.openTime = config.get('OPEN_TIME', '08:00');
    this.closeTime = config.get('CLOSE_TIME', '20:00');
    this.slotMinutes = Number(config.get('SLOT_MINUTES', 30));
    this.cancelLockHours = Number(config.get('CANCEL_LOCK_HOURS', 2));
    this.graceMinutes = Number(config.get('GRACE_MINUTES', 15));
    this.noShowDepositThreshold = Number(config.get('NO_SHOW_DEPOSIT_THRESHOLD', 2));
    this.depositMinDuration = Number(config.get('DEPOSIT_MIN_DURATION', 90));
    this.reminderHours = Number(config.get('REMINDER_HOURS', 24));
    this.depositRate = Number(config.get('DEPOSIT_RATE', 0.2));
    this.depositMinAmount = Number(config.get('DEPOSIT_MIN_AMOUNT', 100000));
    this.depositHoldHours = Number(config.get('DEPOSIT_HOLD_HOURS', 24));
    this.checkInEarlyMinutes = Number(config.get('CHECKIN_EARLY_MINUTES', 60));
    this.maxOpenAppointments = Number(config.get('MAX_OPEN_APPOINTMENTS', 3));
    this.reminderWebhookUrl = config.get('REMINDER_WEBHOOK_URL') || null;
    this.reminderWebhookToken = config.get('REMINDER_WEBHOOK_TOKEN') || null;
    this.salonName = config.get('SALON_NAME', 'Atelier Luxury Haircare');
    this.hotline = config.get('SALON_HOTLINE', '[SỐ HOTLINE]');
    this.address = config.get('SALON_ADDRESS', '[ĐỊA CHỈ SALON]');
    this.allowNegativeStock = String(config.get('ALLOW_NEGATIVE_STOCK', 'false')) === 'true';
  }
}
