CREATE TABLE "service_skills" (
  "service_id" TEXT NOT NULL,
  "skill_id" TEXT NOT NULL,
  CONSTRAINT "service_skills_pkey" PRIMARY KEY ("service_id", "skill_id")
);

CREATE INDEX "service_skills_skill_id_idx" ON "service_skills"("skill_id");

INSERT INTO "service_skills" ("service_id", "skill_id")
SELECT "id", "required_skill_id"
FROM "services";

ALTER TABLE "services" DROP CONSTRAINT "services_required_skill_id_fkey";
ALTER TABLE "services" DROP COLUMN "required_skill_id";

ALTER TABLE "service_skills"
  ADD CONSTRAINT "service_skills_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_skills"
  ADD CONSTRAINT "service_skills_skill_id_fkey"
  FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
