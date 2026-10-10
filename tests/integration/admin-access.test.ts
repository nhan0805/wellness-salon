import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/src/server/db';
import { createDbAdminAccount, createDbAdminSkill, deleteDbAdminAccount, deleteDbAdminSkill, getDbAdminAccounts, getDbAdminSkillManagement, updateDbAdminAccount, updateDbAdminSkill } from '@/src/server/services/admin-operations';

const enabled = process.env.RUN_DB_TESTS === 'true' && Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('PostgreSQL admin access management', () => {
  it('creates, updates, lists, and safely removes skills and accounts', async () => {
    const admin = await prisma.authUser.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true } });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const skillName = `Integration skill ${suffix}`;
    const renamedSkillName = `Renamed skill ${suffix}`;
    const accountEmail = `integration-${suffix}@example.test`;
    let skillId = '';
    let accountId = '';

    try {
      const createdSkill = await createDbAdminSkill({ name: skillName, adminId: admin.id });
      skillId = createdSkill.id;
      const updatedSkill = await updateDbAdminSkill({ id: skillId, name: renamedSkillName, adminId: admin.id });
      expect(updatedSkill.name).toBe(renamedSkillName);
      expect((await getDbAdminSkillManagement()).some((skill) => skill.id === skillId && skill.name === renamedSkillName)).toBe(true);

      const createdAccount = await createDbAdminAccount({ email: accountEmail, password: 'integration-password-123', role: 'STATION', adminId: admin.id });
      accountId = createdAccount.id;
      const updatedAccount = await updateDbAdminAccount({ id: accountId, email: accountEmail, password: 'integration-password-456', role: 'STATION', isActive: false, adminId: admin.id });
      expect(updatedAccount.isActive).toBe(false);
      expect((await getDbAdminAccounts(admin.id)).some((account) => account.id === accountId && !account.isActive)).toBe(true);
      expect((await deleteDbAdminAccount({ id: accountId, adminId: admin.id })).ok).toBe(true);
      expect((await getDbAdminAccounts(admin.id)).some((account) => account.id === accountId)).toBe(false);
      accountId = '';
      await expect(updateDbAdminAccount({ id: admin.id, email: admin.email, role: 'STATION', isActive: false, adminId: admin.id })).rejects.toThrow('cannot deactivate');
      await expect(deleteDbAdminAccount({ id: admin.id, adminId: admin.id })).rejects.toThrow('cannot delete');
    } finally {
      if (accountId) await prisma.authUser.delete({ where: { id: accountId } });
      if (skillId) await deleteDbAdminSkill({ id: skillId, adminId: admin.id });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
