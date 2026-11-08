import { beforeAll, describe, expect, it } from "vitest";
import { db, tryAsUser, userId } from "./helpers";

let admin: string;
let sam: string;

beforeAll(async () => {
  admin = await userId("admin@example.com");
  sam = await userId("sam@example.com");
});

describe("script deletion", () => {
  it("an admin can delete a script, removing all its versions", async () => {
    await tryAsUser(admin, async (tx) => {
      // 1. Publish two versions of a test script
      await tx`select app.publish_script('test-del-script', null, 'opening', 'Test Delete v1', 'Body 1')`;
      await tx`select app.publish_script('test-del-script', null, 'opening', 'Test Delete v2', 'Body 2')`;

      const before = await tx`select count(*)::int as n from scripts where script_key = 'test-del-script'`;
      expect(before[0].n).toBe(2);

      // 2. Delete the script
      await tx`delete from scripts where script_key = 'test-del-script'`;

      const after = await tx`select count(*)::int as n from scripts where script_key = 'test-del-script'`;
      expect(after[0].n).toBe(0);
    });
  });

  it("salespeople cannot delete scripts", async () => {
    await tryAsUser(admin, async (tx) => {
      await tx`select app.publish_script('test-sam-del', null, 'opening', 'Sam cannot delete', 'Body')`;
    });

    await expect(
      tryAsUser(sam, async (tx) => {
        await tx`delete from scripts where script_key = 'test-sam-del'`;
      }),
    ).rejects.toThrow();
  });
});
