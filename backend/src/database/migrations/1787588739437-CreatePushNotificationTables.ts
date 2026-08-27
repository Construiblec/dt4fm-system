import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePushNotificationTables1787588739437 implements MigrationInterface {
    name = 'CreatePushNotificationTables1787588739437'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "notification_dispatch_log" ("event_key" text NOT NULL, "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_60898fc4225e26964aa34ef98c4" PRIMARY KEY ("event_key"))`);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" text NOT NULL, "type" text NOT NULL, "title" text NOT NULL, "body" text NOT NULL, "deep_link" text, "entity_kind" text, "entity_id" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "read_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_310667f935698fcd8cb319113a" ON "notifications"  ("user_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "push_subscriptions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" text NOT NULL, "username" text NOT NULL, "role" text NOT NULL, "employee_id" integer, "cleaning_employee_id" integer, "endpoint" text NOT NULL, "p256dh" text NOT NULL, "auth" text NOT NULL, "user_agent" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "failure_count" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_0008bdfd174e533a3f98bf9af16" UNIQUE ("endpoint"), CONSTRAINT "PK_757fc8f00c34f66832668dc2e53" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1bc17daca9fdb5f49319ed0577" ON "push_subscriptions"  ("cleaning_employee_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_a14f1b453e3a412e12f2550abc" ON "push_subscriptions"  ("employee_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_3245138de70e8f2e153e36ee0b" ON "push_subscriptions"  ("role") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_3245138de70e8f2e153e36ee0b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a14f1b453e3a412e12f2550abc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1bc17daca9fdb5f49319ed0577"`);
        await queryRunner.query(`DROP TABLE "push_subscriptions"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_310667f935698fcd8cb319113a"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP TABLE "notification_dispatch_log"`);
    }

}
