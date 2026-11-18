-- The Finance page was removed: the app stays webhosting-only. Drops its read-only copy of the Elorus books.
DROP TABLE IF EXISTS "FinanceLine";
DROP TABLE IF EXISTS "FinanceDoc";
DROP TABLE IF EXISTS "CategoryRule";
DROP TYPE IF EXISTS "FinanceKind";
