import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function create(url = process.env.DATABASE_URL) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export type Db = ReturnType<typeof create>;

const g = globalThis as unknown as { __prisma?: Db };
export const db: Db = g.__prisma ?? create();
if (process.env.NODE_ENV !== "production") g.__prisma = db;

export { create as createDb };

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
