import { MigrationInterface, QueryRunner } from "typeorm";

export class Audit31Fixes1793600000000 implements MigrationInterface {
    name = 'Audit31Fixes1793600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."leave_requests_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "leave_requests" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "date" date NOT NULL, "fromTime" character varying(5) NOT NULL, "toTime" character varying(5) NOT NULL, "reason" text, "status" "public"."leave_requests_status_enum" NOT NULL DEFAULT 'PENDING', "handledBy" character varying(120), "handledAt" TIMESTAMP WITH TIME ZONE, "handledNote" text, "employeeId" integer, CONSTRAINT "PK_d3abcf9a16cef1450129e06fa9f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "closed_days" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "date" date NOT NULL, "reason" character varying(200) NOT NULL, CONSTRAINT "PK_ac51efc413a8e9852017cfe3f67" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5769a3ac6863ecd3f8942ca489" ON "closed_days" ("date") `);
        await queryRunner.query(`CREATE TYPE "public"."walk_in_queue_status_enum" AS ENUM('WAITING', 'SERVED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "walk_in_queue" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "phone" character varying(20), "serviceIds" text NOT NULL, "stylistId" integer, "status" "public"."walk_in_queue_status_enum" NOT NULL DEFAULT 'WAITING', "note" text, "sessionId" integer, CONSTRAINT "PK_634fe9bba63ab558616096cd88f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "service_materials" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "quantity" integer NOT NULL, "serviceId" integer, "productId" integer, CONSTRAINT "UQ_d78fc8a4afdea39a965f6b7fad4" UNIQUE ("serviceId", "productId"), CONSTRAINT "PK_64dd95763ab3e0596441543d4ad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "isAnonymous" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "customers" ADD "anonymizedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "employees" ADD "commissionRate" numeric(5,4)`);
        await queryRunner.query(`ALTER TABLE "service_session_items" ADD "commissionRate" numeric(5,4) NOT NULL DEFAULT '0.1'`);
        await queryRunner.query(`CREATE TYPE "public"."service_session_items_commissionmode_enum" AS ENUM('PERCENT_SPLIT', 'FIXED_TASK')`);
        await queryRunner.query(`ALTER TABLE "service_session_items" ADD "commissionMode" "public"."service_session_items_commissionmode_enum" NOT NULL DEFAULT 'PERCENT_SPLIT'`);
        await queryRunner.query(`ALTER TABLE "service_session_items" ADD "leadShare" numeric(5,4) NOT NULL DEFAULT '0.7'`);
        await queryRunner.query(`ALTER TABLE "service_session_items" ADD "assistantFixedFee" bigint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "service_session_items" ADD "appointmentItemId" integer`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "promotionId" integer`);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "commissionRate" SET DEFAULT '0.1'`);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "leadShare" SET DEFAULT '0.7'`);
        await queryRunner.query(`ALTER TYPE "public"."invoice_items_type_enum" RENAME TO "invoice_items_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."invoice_items_type_enum" AS ENUM('SERVICE', 'PRODUCT', 'ADJUSTMENT')`);
        await queryRunner.query(`ALTER TABLE "invoice_items" ALTER COLUMN "type" TYPE "public"."invoice_items_type_enum" USING "type"::"text"::"public"."invoice_items_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."invoice_items_type_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."payments_method_enum" RENAME TO "payments_method_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."payments_method_enum" AS ENUM('CASH', 'TRANSFER', 'DEPOSIT', 'REFUND')`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "method" TYPE "public"."payments_method_enum" USING "method"::"text"::"public"."payments_method_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_method_enum_old"`);
        await queryRunner.query(`ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_4eda1468756ca831495e308e407" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "service_materials" ADD CONSTRAINT "FK_3c4f99d22a0cf321ef234bee9e7" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "service_materials" ADD CONSTRAINT "FK_1ed5f07c1e18780b1929e1a0915" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        // Dữ liệu cũ: chốt hoa hồng của dòng dịch vụ đã có theo cấu hình hiện tại, nhận diện hồ sơ vãng lai và khuyến mãi theo id.
        await queryRunner.query(`UPDATE "service_session_items" i SET "commissionRate" = s."commissionRate", "commissionMode" = s."commissionMode"::text::"public"."service_session_items_commissionmode_enum", "leadShare" = s."leadShare", "assistantFixedFee" = s."assistantFixedFee" FROM "services" s WHERE s.id = i."serviceId"`);
        await queryRunner.query(`UPDATE "customers" SET "isAnonymous" = true WHERE "phone" = '0000000000'`);
        await queryRunner.query(`UPDATE "invoices" v SET "promotionId" = p.id FROM "promotions" p WHERE v."promotionName" = p."name" AND (SELECT count(*) FROM "promotions" q WHERE q."name" = p."name") = 1`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "service_materials" DROP CONSTRAINT "FK_1ed5f07c1e18780b1929e1a0915"`);
        await queryRunner.query(`ALTER TABLE "service_materials" DROP CONSTRAINT "FK_3c4f99d22a0cf321ef234bee9e7"`);
        await queryRunner.query(`ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_4eda1468756ca831495e308e407"`);
        await queryRunner.query(`CREATE TYPE "public"."payments_method_enum_old" AS ENUM('CASH', 'TRANSFER')`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "method" TYPE "public"."payments_method_enum_old" USING "method"::"text"::"public"."payments_method_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."payments_method_enum_old" RENAME TO "payments_method_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."invoice_items_type_enum_old" AS ENUM('SERVICE', 'PRODUCT')`);
        await queryRunner.query(`ALTER TABLE "invoice_items" ALTER COLUMN "type" TYPE "public"."invoice_items_type_enum_old" USING "type"::"text"::"public"."invoice_items_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."invoice_items_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."invoice_items_type_enum_old" RENAME TO "invoice_items_type_enum"`);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "leadShare" SET DEFAULT 0.7`);
        await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "commissionRate" SET DEFAULT 0.1`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "promotionId"`);
        await queryRunner.query(`ALTER TABLE "service_session_items" DROP COLUMN "appointmentItemId"`);
        await queryRunner.query(`ALTER TABLE "service_session_items" DROP COLUMN "assistantFixedFee"`);
        await queryRunner.query(`ALTER TABLE "service_session_items" DROP COLUMN "leadShare"`);
        await queryRunner.query(`ALTER TABLE "service_session_items" DROP COLUMN "commissionMode"`);
        await queryRunner.query(`DROP TYPE "public"."service_session_items_commissionmode_enum"`);
        await queryRunner.query(`ALTER TABLE "service_session_items" DROP COLUMN "commissionRate"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "commissionRate"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "anonymizedAt"`);
        await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "isAnonymous"`);
        await queryRunner.query(`DROP TABLE "service_materials"`);
        await queryRunner.query(`DROP TABLE "walk_in_queue"`);
        await queryRunner.query(`DROP TYPE "public"."walk_in_queue_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5769a3ac6863ecd3f8942ca489"`);
        await queryRunner.query(`DROP TABLE "closed_days"`);
        await queryRunner.query(`DROP TABLE "leave_requests"`);
        await queryRunner.query(`DROP TYPE "public"."leave_requests_status_enum"`);
    }

}
