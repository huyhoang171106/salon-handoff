import { MigrationInterface, QueryRunner } from "typeorm";

export class ResourcesReminders1793023926491 implements MigrationInterface {
    name = 'ResourcesReminders1793023926491'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "services" ADD "requiredEquipment" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD "remindedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "equipment" ADD "kind" character varying(20) NOT NULL DEFAULT 'KHAC'`);
        // Dữ liệu cũ: mã thiết bị theo dạng LOAI-nn (GHE-01, HAP-02...) -> suy ra loại.
        await queryRunner.query(`UPDATE "equipment" SET "kind" = split_part("code", '-', 1) WHERE split_part("code", '-', 1) IN ('GHE','GUONG','GIUONG','SAY','HAP','UON','XE')`);
        await queryRunner.query(`UPDATE "services" SET "requiredEquipment" = CASE "category" WHEN 'GỘI SẤY' THEN 'GIUONG' WHEN 'HÓA CHẤT' THEN 'UON' WHEN 'HAIR SPA' THEN 'HAP' END`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "equipment" DROP COLUMN "kind"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "remindedAt"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "requiredEquipment"`);
    }

}
