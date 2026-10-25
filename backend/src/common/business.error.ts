import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Lỗi vi phạm quy tắc nghiệp vụ. `rule` là mã BR trong tài liệu (vd "BR-01")
 * để giao diện hiển thị lý do rõ ràng cho người dùng.
 */
export class BusinessRuleError extends HttpException {
  constructor(rule: string, message: string, status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY) {
    super({ statusCode: status, rule, message }, status);
  }
}
