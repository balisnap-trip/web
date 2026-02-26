import pg from "pg";
import { resolveOpsDbUrl } from "./_legacy-db-env.mjs";

const { Client } = pg;

const SQL = `
create table if not exists catalog_product_content (
  product_key uuid primary key references catalog_product(product_key) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_by varchar(191),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;

async function run() {
  const connectionString = resolveOpsDbUrl(process.env);
  if (!connectionString) {
    throw new Error("Missing OPS_DB_URL environment variable (or legacy DATABASE_URL)");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("begin");
    await client.query(SQL);
    await client.query("commit");
    console.log("CATALOG_CONTENT_BOOTSTRAP_RESULT=PASS");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(`CATALOG_CONTENT_BOOTSTRAP_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
