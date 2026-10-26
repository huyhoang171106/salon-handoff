import { MigrationInterface, QueryRunner } from "typeorm";

export class MidShiftLeave1793500000000 implements MigrationInterface {
    name = 'MidShiftLeave1793500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "work_shifts" ADD "leaveStart" character varying(5)`);
        await queryRunner.query(`ALTER TABLE "work_shifts" ADD "leaveEnd" character varying(5)`);
        await queryRunner.query(`ALTER TABLE "work_shifts" ADD "leaveReason" text`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD "stylistChangeNote" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "stylistChangeNote"`);
        await queryRunner.query(`ALTER TABLE "work_shifts" DROP COLUMN "leaveReason"`);
        await queryRunner.query(`ALTER TABLE "work_shifts" DROP COLUMN "leaveEnd"`);
        await queryRunner.query(`ALTER TABLE "work_shifts" DROP COLUMN "leaveStart"`);
    }
}
