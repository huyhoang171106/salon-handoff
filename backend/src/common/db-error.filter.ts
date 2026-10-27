import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

/** Tên cột trong thông báo "Key (code)=(X) already exists" -> nhãn tiếng Việt. */
const FIELD: Record<string, string> = { code: 'Mã', sku: 'Mã SKU', phone: 'Số điện thoại', username: 'Tên đăng nhập', reference: 'Mã giao dịch' };

/** Lỗi ràng buộc của PostgreSQL trả về 4xx dễ hiểu thay vì 500. */
@Catch(QueryFailedError)
export class DbErrorFilter implements ExceptionFilter {
  catch(e: QueryFailedError & { code?: string; detail?: string }, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (e.code === '23505') {
      const col = /Key \(([^)]+)\)/.exec(e.detail ?? '')?.[1]?.split(',')[0].replace(/"/g, '') ?? '';
      return res.status(HttpStatus.CONFLICT).json({ statusCode: 409, message: `${FIELD[col] ?? 'Giá trị'} đã tồn tại` });
    }
    if (e.code === '23503') return res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: 'Dữ liệu tham chiếu không tồn tại hoặc đang được sử dụng' });
    console.error(e);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'Internal server error' });
  }
}
