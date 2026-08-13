import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsRoot = join(projectRoot, "drizzle");
const journalPath = join(migrationsRoot, "meta", "_journal.json");
const command = process.argv[2];
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const lockName = "aitrainer:drizzle-migrations";

if (!new Set(["baseline", "check", "migrate"]).has(command)) {
  throw new Error("Usage: node scripts/manage-database.mjs <baseline|check|migrate>");
}
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL is required");
}

const journal = await readJson(journalPath);
const latestEntry = journal.entries.at(-1);
if (!latestEntry) throw new Error("Migration journal is empty");
const snapshot = await readJson(join(
  migrationsRoot,
  "meta",
  `${String(latestEntry.idx).padStart(4, "0")}_snapshot.json`,
));
const migrations = await loadMigrations(journal);
const client = postgres(connectionString, {
  connect_timeout: 10,
  idle_timeout: 5,
  max: 1,
  prepare: false,
});

try {
  await client.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${lockName}))`;
    await tx`set local lock_timeout = '10s'`;
    await tx`set local statement_timeout = '60s'`;

    if (command === "baseline") {
      await verifySchema(tx, snapshot);
      await ensureMigrationTable(tx);
      const applied = await appliedMigrations(tx);
      if (applied.length > 0) {
        assertAppliedPrefix(applied, migrations);
        if (applied.length !== migrations.length) {
          throw new Error("Migration tracking is partial; run db:migrate instead of baselining");
        }
      } else {
        for (const migration of migrations) {
          await recordMigration(tx, migration);
        }
      }
      console.log(`Baseline verified and recorded at ${versionLabel(migrations.at(-1))}`);
      return;
    }

    if (command === "migrate") {
      await ensureMigrationTable(tx);
    } else {
      const trackingTable = await tx`select to_regclass('drizzle.__drizzle_migrations')::text as name`;
      if (!trackingTable[0]?.name) {
        throw new Error("Migration baseline is missing; run db:baseline after verifying the production schema");
      }
    }
    const applied = await appliedMigrations(tx);
    assertAppliedPrefix(applied, migrations);

    if (command === "migrate") {
      for (const migration of migrations.slice(applied.length)) {
        for (const statement of migration.statements) {
          if (statement.trim()) await tx.unsafe(statement);
        }
        await recordMigration(tx, migration);
        console.log(`Applied ${migration.tag}`);
      }
    } else if (applied.length !== migrations.length) {
      const pending = migrations.slice(applied.length).map((migration) => migration.tag).join(", ");
      throw new Error(`Database schema is behind; pending migrations: ${pending}`);
    }

    await verifySchema(tx, snapshot);
    console.log(`Schema is current at ${versionLabel(migrations.at(-1))}`);
  });
} finally {
  await client.end({ timeout: 5 });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadMigrations(journal) {
  const sqlFiles = (await readdir(migrationsRoot)).filter((name) => name.endsWith(".sql")).sort();
  const expectedFiles = journal.entries.map((entry) => `${entry.tag}.sql`);
  if (JSON.stringify(sqlFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`Migration journal and SQL files differ: ${sqlFiles.join(", ")}`);
  }

  return Promise.all(journal.entries.map(async (entry) => {
    const path = join(migrationsRoot, `${entry.tag}.sql`);
    const sql = await readFile(path, "utf8");
    return {
      createdAt: Number(entry.when),
      hash: createHash("sha256").update(sql).digest("hex"),
      statements: sql.split("--> statement-breakpoint"),
      tag: entry.tag,
    };
  }));
}

async function ensureMigrationTable(tx) {
  await tx`create schema if not exists drizzle`;
  await tx`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;
}

async function appliedMigrations(tx) {
  return tx`
    select hash, created_at
    from drizzle.__drizzle_migrations
    order by created_at, id
  `;
}

function assertAppliedPrefix(applied, migrations) {
  if (applied.length > migrations.length) {
    throw new Error("Database contains migrations newer than this release");
  }
  for (let index = 0; index < applied.length; index += 1) {
    const actual = applied[index];
    const expected = migrations[index];
    if (Number(actual.created_at) !== expected.createdAt || actual.hash !== expected.hash) {
      throw new Error(
        `Migration history diverged at position ${index}: expected ${versionLabel(expected)}`,
      );
    }
  }
}

async function recordMigration(tx, migration) {
  await tx`
    insert into drizzle.__drizzle_migrations (hash, created_at)
    values (${migration.hash}, ${migration.createdAt})
  `;
}

async function verifySchema(tx, snapshot) {
  const expectedTables = Object.values(snapshot.tables);
  const expectedNames = expectedTables.map((table) => table.name).sort();
  const actualTables = await tx`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = any(${expectedNames})
    order by table_name
  `;
  assertEqual("managed tables", actualTables.map((row) => row.table_name), expectedNames);

  for (const table of expectedTables) {
    const actualColumns = await tx`
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = ${table.name}
      order by ordinal_position
    `;
    const expectedColumns = Object.values(table.columns);
    assertEqual(
      `${table.name} columns`,
      actualColumns.map((column) => ({
        default: normalizeDefault(column.column_default),
        name: column.column_name,
        notNull: column.is_nullable === "NO",
        type: column.data_type,
      })).sort(compareByName),
      expectedColumns.map((column) => ({
        default: expectedDefault(column),
        name: column.name,
        notNull: column.notNull,
        type: column.type === "serial" ? "integer" : column.type,
      })).sort(compareByName),
    );

    const actualConstraints = await tx`
      select
        constraint_row.contype as type,
        constraint_row.conname as name,
        array_agg(source_attribute.attname order by source_key.ordinality)::text[] as columns,
        target_table.relname as target_table,
        array_remove(array_agg(target_attribute.attname order by source_key.ordinality), null)::text[] as target_columns,
        constraint_row.confdeltype as on_delete,
        constraint_row.confupdtype as on_update
      from pg_constraint constraint_row
      join pg_class source_table on source_table.oid = constraint_row.conrelid
      join pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
      join unnest(constraint_row.conkey) with ordinality as source_key(attribute_number, ordinality) on true
      join pg_attribute source_attribute on source_attribute.attrelid = source_table.oid and source_attribute.attnum = source_key.attribute_number
      left join unnest(constraint_row.confkey) with ordinality as target_key(attribute_number, ordinality)
        on target_key.ordinality = source_key.ordinality
      left join pg_class target_table on target_table.oid = constraint_row.confrelid
      left join pg_attribute target_attribute on target_attribute.attrelid = target_table.oid
        and target_attribute.attnum = target_key.attribute_number
      where source_namespace.nspname = 'public'
        and source_table.relname = ${table.name}
        and constraint_row.contype in ('p', 'f')
      group by constraint_row.oid, target_table.relname
      order by constraint_row.conname
    `;
    assertEqual(
      `${table.name} constraints`,
      actualConstraints.map(normalizeConstraint),
      expectedConstraints(table),
    );

    const actualIndexes = await tx`
      select index_class.relname as name,
        index_row.indisunique as unique,
        array_agg(attribute.attname order by index_key.ordinality)::text[] as columns
      from pg_index index_row
      join pg_class table_class on table_class.oid = index_row.indrelid
      join pg_namespace namespace_row on namespace_row.oid = table_class.relnamespace
      join pg_class index_class on index_class.oid = index_row.indexrelid
      join unnest(index_row.indkey) with ordinality as index_key(attribute_number, ordinality) on true
      join pg_attribute attribute on attribute.attrelid = table_class.oid and attribute.attnum = index_key.attribute_number
      where namespace_row.nspname = 'public'
        and table_class.relname = ${table.name}
        and not exists (select 1 from pg_constraint where conindid = index_row.indexrelid)
      group by index_class.relname, index_row.indisunique
      order by index_class.relname
    `;
    assertEqual(
      `${table.name} indexes`,
      actualIndexes.map((index) => ({ columns: index.columns, name: index.name, unique: index.unique })),
      Object.values(table.indexes).map((index) => ({
        columns: index.columns.map((column) => column.expression),
        name: index.name,
        unique: index.isUnique,
      })).sort((left, right) => left.name.localeCompare(right.name)),
    );
  }
}

function expectedDefault(column) {
  if (column.type === "serial") return "serial";
  if (!("default" in column)) return null;
  if (column.default === "''") return "''";
  return String(column.default);
}

function normalizeDefault(value) {
  if (value === null) return null;
  if (/^nextval\(/.test(value)) return "serial";
  return value.replace(/::(?:text|boolean|integer)$/, "");
}

function expectedConstraints(table) {
  const constraints = [];
  const inlinePrimaryKey = Object.values(table.columns).find((column) => column.primaryKey);
  if (inlinePrimaryKey) {
    constraints.push({ columns: [inlinePrimaryKey.name], name: `${table.name}_pkey`, type: "p" });
  }
  for (const primaryKey of Object.values(table.compositePrimaryKeys)) {
    constraints.push({ columns: primaryKey.columns, name: primaryKey.name, type: "p" });
  }
  for (const foreignKey of Object.values(table.foreignKeys)) {
    constraints.push({
      columns: foreignKey.columnsFrom,
      name: foreignKey.name,
      onDelete: actionCode(foreignKey.onDelete),
      onUpdate: actionCode(foreignKey.onUpdate),
      targetColumns: foreignKey.columnsTo,
      targetTable: foreignKey.tableTo,
      type: "f",
    });
  }
  return constraints.sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeConstraint(constraint) {
  if (constraint.type === "p") {
    return { columns: constraint.columns, name: constraint.name, type: constraint.type };
  }
  return {
    columns: constraint.columns,
    name: constraint.name,
    onDelete: constraint.on_delete,
    onUpdate: constraint.on_update,
    targetColumns: constraint.target_columns,
    targetTable: constraint.target_table,
    type: constraint.type,
  };
}

function actionCode(action) {
  return ({ cascade: "c", "no action": "a", restrict: "r", "set null": "n", "set default": "d" })[action];
}

function assertEqual(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} differ from db/schema.ts\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(actual)}`);
  }
}

function compareByName(left, right) {
  return left.name.localeCompare(right.name);
}

function versionLabel(migration) {
  return `${basename(migration.tag)} (${migration.createdAt}, ${migration.hash.slice(0, 12)})`;
}
