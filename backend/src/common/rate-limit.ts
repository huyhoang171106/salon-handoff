import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'rateLimit';

/** Giới hạn `max` lần / `windowSec` giây cho mỗi IP trên endpoint này. */
export const RateLimit = (max: number, windowSec: number) => SetMetadata(RATE_LIMIT_KEY, { max, windowSec });

/**
 * Cửa sổ trượt trong bộ nhớ theo IP + endpoint.
 * ponytail: chỉ đúng với một instance API; chạy nhiều instance thì chuyển sang Redis hoặc @nestjs/throttler.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const cfg = this.reflector.get<{ max: number; windowSec: number } | undefined>(RATE_LIMIT_KEY, ctx.getHandler());
    if (!cfg) return true;
    const req = ctx.switchToHttp().getRequest();
    const key = `${req.ip}|${req.method} ${req.route?.path ?? req.url}`;
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < cfg.windowSec * 1000);
    if (recent.length >= cfg.max) {
      this.hits.set(key, recent);
      throw new HttpException({ statusCode: 429, message: 'Thao tác quá nhanh, vui lòng thử lại sau ít phút' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < cfg.windowSec * 1000)) this.hits.delete(k);
    return true;
  }
}
