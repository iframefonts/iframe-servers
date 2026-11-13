import { db as defaultDb, type Db } from "@/lib/db";
import { getElorus, type ElorusApi, type ElorusContact } from "@/lib/elorus/client";

export function cachedFields(c: ElorusContact) {
  return {
    name: c.name,
    company: c.company ?? null,
    vatNumber: c.vatNumber ?? null,
    taxOffice: c.taxOffice ?? null,
    address: c.address ?? null,
    emails: c.emails,
    phone: c.phone ?? null,
  };
}

/** Refreshes one linked client from Elorus and logs what changed. */
export async function syncClientFromElorus(clientId: string, deps: { db?: Db; elorus?: ElorusApi } = {}) {
  const db = deps.db ?? defaultDb;
  const elorus = deps.elorus ?? getElorus();
  const client = await db.client.findUniqueOrThrow({ where: { id: clientId } });
  if (!client.elorusContactId) return client;
  const fresh = cachedFields(await elorus.getContact(client.elorusContactId));
  const changed = (Object.keys(fresh) as (keyof typeof fresh)[]).filter(
    (k) => JSON.stringify(fresh[k]) !== JSON.stringify(client[k]),
  );
  const updated = await db.client.update({ where: { id: clientId }, data: { ...fresh, syncedAt: new Date() } });
  if (changed.length) {
    await db.auditLog.create({
      data: {
        actor: "elorus-sync",
        action: "client.synced",
        entity: "Client",
        entityId: clientId,
        data: Object.fromEntries(changed.map((k) => [k, { from: client[k], to: fresh[k] }])),
      },
    });
  }
  return updated;
}

export async function syncAllClients(deps: { db?: Db; elorus?: ElorusApi } = {}) {
  const db = deps.db ?? defaultDb;
  const linked = await db.client.findMany({ where: { elorusContactId: { not: null } }, select: { id: true } });
  let ok = 0;
  let failed = 0;
  for (const c of linked) {
    try {
      await syncClientFromElorus(c.id, deps);
      ok++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}
