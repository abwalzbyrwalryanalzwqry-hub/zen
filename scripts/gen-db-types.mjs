/**
 * توليد أنواع TypeScript لقاعدة البيانات من الترحيلات نفسها (المرحلة 8.3).
 *
 * يُشغّل PostgreSQL مضمّناً (كما في test:db)، ويبني بيئة Supabase المصغّرة من
 * supabase/tests/bootstrap.sql، ثم ينفّذ كل الترحيلات، ثم يقرأ فهرس النظام
 * (pg_catalog) ويكتب src/integrations/supabase/types.ts بصيغة `supabase gen types`.
 *
 * لماذا لا `supabase gen types`؟ لأنه يحتاج Docker أو رمز وصول لمشروع الإنتاج، وهذا
 * يولّد الأنواع من مصدر الحقيقة الموجود في المستودع (الترحيلات) دون أي اتصال خارجي.
 *
 * التشغيل:  npm run gen:types
 * الفحص:    npm run gen:types -- --check   (يفشل إن كان الملف المحفوظ قديماً)
 */
import EmbeddedPostgresModule from "embedded-postgres";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EmbeddedPostgres = EmbeddedPostgresModule.default ?? EmbeddedPostgresModule;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG_DIR = path.join(ROOT, "supabase", "migrations");
const BOOTSTRAP = path.join(ROOT, "supabase", "tests", "bootstrap.sql");
const OUT = path.join(ROOT, "src", "integrations", "supabase", "types.ts");
const CHECK = process.argv.includes("--check");
const DATA_DIR = path.join(os.tmpdir(), `zen-typegen-${process.pid}`);

const SCALARS = {
  bool: "boolean",
  int2: "number",
  int4: "number",
  int8: "number",
  float4: "number",
  float8: "number",
  numeric: "number",
  oid: "number",
  text: "string",
  varchar: "string",
  bpchar: "string",
  citext: "string",
  name: "string",
  uuid: "string",
  date: "string",
  time: "string",
  timetz: "string",
  timestamp: "string",
  timestamptz: "string",
  interval: "string",
  bytea: "string",
  inet: "unknown",
  json: "Json",
  jsonb: "Json",
  void: "undefined",
  record: "Record<string, unknown>",
};

const q = (s) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) ? s : JSON.stringify(s));

(async () => {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: Number(process.env.TYPEGEN_PG_PORT || 55433),
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();

  try {
    await client.query(fs.readFileSync(BOOTSTRAP, "utf8"));
    for (const f of fs
      .readdirSync(MIG_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      try {
        await client.query(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
      } catch (e) {
        throw new Error(`الترحيل ${f} فشل: ${e.message}`);
      }
    }

    const { rows: enums } = await client.query(`
      SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY t.typname`);
    const enumNames = new Set(enums.map((e) => e.name));

    const { rows: rels } = await client.query(`
      SELECT c.oid, c.relname AS name, c.relkind AS kind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
        AND c.relname NOT LIKE '\\_%'
      ORDER BY c.relname`);

    const { rows: cols } = await client.query(`
      SELECT a.attrelid AS rel, a.attname AS name, a.attnotnull AS notnull,
             (a.atthasdef OR a.attidentity <> '') AS hasdef,
             a.attgenerated <> '' AS generated,
             t.typname AS typ, t.typcategory AS cat, et.typname AS elem
      FROM pg_attribute a
      JOIN pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_type et ON et.oid = t.typelem AND t.typcategory = 'A'
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attname`);

    const { rows: fks } = await client.query(`
      SELECT con.conname AS name, con.conrelid AS rel, tc.relname AS target,
             (SELECT array_agg(a.attname::text ORDER BY k.i) FROM unnest(con.conkey) WITH ORDINALITY k(n,i)
                JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n) AS cols,
             (SELECT array_agg(a.attname::text ORDER BY k.i) FROM unnest(con.confkey) WITH ORDINALITY k(n,i)
                JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n) AS refcols,
             EXISTS (SELECT 1 FROM pg_constraint u WHERE u.conrelid = con.conrelid
                       AND u.contype IN ('p','u') AND u.conkey::int[] @> con.conkey::int[]
                       AND u.conkey::int[] <@ con.conkey::int[]) AS one_to_one
      FROM pg_constraint con
      JOIN pg_class tc ON tc.oid = con.confrelid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE con.contype = 'f' AND tn.nspname = 'public'
      ORDER BY con.conname`);

    const { rows: fns } = await client.query(`
      SELECT p.proname AS name, p.proretset AS setof, rt.typname AS rettype,
             rt.typcategory AS retcat, ret.typname AS retelem, rt.typtype AS rettyptype,
             p.pronargdefaults AS ndefaults,
             COALESCE(p.proargnames, '{}')::text[] AS argnames,
             COALESCE(p.proargmodes::text[], '{}') AS argmodes,
             (SELECT array_agg(t.typname::text ORDER BY i) FROM unnest(COALESCE(p.proallargtypes, p.proargtypes::oid[])) WITH ORDINALITY x(o,i) JOIN pg_type t ON t.oid = x.o) AS argtypes,
             (SELECT array_agg(COALESCE(et.typname::text, '') ORDER BY i) FROM unnest(COALESCE(p.proallargtypes, p.proargtypes::oid[])) WITH ORDINALITY x(o,i) JOIN pg_type t ON t.oid = x.o LEFT JOIN pg_type et ON et.oid = t.typelem AND t.typcategory = 'A') AS argelems
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_type rt ON rt.oid = p.prorettype
      LEFT JOIN pg_type ret ON ret.oid = rt.typelem AND rt.typcategory = 'A'
      WHERE n.nspname = 'public' AND p.prokind = 'f'
        AND rt.typname NOT IN ('trigger', 'event_trigger')
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      ORDER BY p.proname, p.oid`);

    const relByName = new Map(rels.map((r) => [r.name, r]));

    const tsType = (typ, cat, elem) => {
      if (cat === "A") return `${tsType(elem, "", null)}[]`;
      if (enumNames.has(typ)) return `Database["public"]["Enums"][${JSON.stringify(typ)}]`;
      const rel = relByName.get(typ);
      if (rel) return `Database["public"]["Tables"][${JSON.stringify(typ)}]["Row"]`;
      return SCALARS[typ] ?? "unknown";
    };

    const I = (n) => "  ".repeat(n);
    let out = "";
    const w = (s) => (out += s + "\n");

    w("// ملف مولَّد — لا تعدّله يدوياً. أعد توليده بـ `npm run gen:types` بعد أي ترحيل.");
    w(
      "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];",
    );
    w("");
    w("export type Database = {");
    w(`${I(1)}// Allows to automatically instantiate createClient with right options`);
    w(`${I(1)}// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)`);
    w(`${I(1)}__InternalSupabase: {`);
    w(`${I(2)}PostgrestVersion: "14.5";`);
    w(`${I(1)}};`);
    w(`${I(1)}public: {`);

    const writeRel = (r, isView) => {
      const cs = cols.filter((c) => c.rel === r.oid);
      w(`${I(3)}${q(r.name)}: {`);
      w(`${I(4)}Row: {`);
      for (const c of cs) {
        const t = tsType(c.typ, c.cat, c.elem);
        w(`${I(5)}${q(c.name)}: ${t}${c.notnull && !isView ? "" : " | null"};`);
      }
      w(`${I(4)}};`);
      for (const kind of ["Insert", "Update"]) {
        w(`${I(4)}${kind}: {`);
        for (const c of cs) {
          const t = tsType(c.typ, c.cat, c.elem);
          if (c.generated) {
            w(`${I(5)}${q(c.name)}?: never;`);
            continue;
          }
          const optional = kind === "Update" || isView || !c.notnull || c.hasdef;
          w(
            `${I(5)}${q(c.name)}${optional ? "?" : ""}: ${t}${c.notnull && !isView ? "" : " | null"};`,
          );
        }
        w(`${I(4)}};`);
      }
      const rf = fks.filter((f) => f.rel === r.oid);
      if (!rf.length) w(`${I(4)}Relationships: [];`);
      else {
        w(`${I(4)}Relationships: [`);
        for (const f of rf) {
          w(`${I(5)}{`);
          w(`${I(6)}foreignKeyName: ${JSON.stringify(f.name)};`);
          w(`${I(6)}columns: [${f.cols.map((c) => JSON.stringify(c)).join(", ")}];`);
          w(`${I(6)}isOneToOne: ${f.one_to_one};`);
          w(`${I(6)}referencedRelation: ${JSON.stringify(f.target)};`);
          w(`${I(6)}referencedColumns: [${f.refcols.map((c) => JSON.stringify(c)).join(", ")}];`);
          w(`${I(5)}},`);
        }
        w(`${I(4)}];`);
      }
      w(`${I(3)}};`);
    };

    const tables = rels.filter((r) => r.kind === "r" || r.kind === "p");
    const views = rels.filter((r) => r.kind === "v" || r.kind === "m");
    w(`${I(2)}Tables: {`);
    tables.forEach((r) => writeRel(r, false));
    w(`${I(2)}};`);
    if (!views.length) w(`${I(2)}Views: {\n${I(3)}[_ in never]: never;\n${I(2)}};`);
    else {
      w(`${I(2)}Views: {`);
      views.forEach((r) => writeRel(r, true));
      w(`${I(2)}};`);
    }

    // الدوال: الوسائط ذات القيمة الافتراضية اختيارية؛ الدوال المحمَّلة (overloads) اتحاد.
    const byName = new Map();
    for (const f of fns) {
      const names = f.argnames;
      const modes = f.argmodes.length ? f.argmodes : (f.argtypes?.map(() => "i") ?? []);
      const types = f.argtypes ?? [];
      const elems = f.argelems ?? [];
      const ins = [];
      const outs = [];
      types.forEach((t, i) => {
        const m = modes[i] ?? "i";
        const entry = { name: names[i] || `arg${i}`, t: tsType(t, elems[i] ? "A" : "", elems[i]) };
        if (m === "i" || m === "b" || m === "v") ins.push(entry);
        if (m === "o" || m === "b" || m === "t") outs.push(entry);
      });
      const firstDefault = ins.length - f.ndefaults;
      let args;
      if (!ins.length) args = "never";
      else
        args =
          "{ " +
          ins
            // PostgreSQL يقبل NULL لأي وسيط، والكود يمرّره قصداً (مثل _halaqa_id بلا حلقة).
            .map((a, i) => `${q(a.name)}${i >= firstDefault ? "?" : ""}: ${a.t} | null`)
            .join("; ") +
          " }";
      let ret;
      if (outs.length && (f.rettype === "record" || modes.includes("t"))) {
        ret = "{ " + outs.map((o) => `${q(o.name)}: ${o.t}`).join("; ") + " }";
      } else {
        ret = tsType(f.rettype, f.retcat, f.retelem);
      }
      if (f.setof) ret = ret.includes(" ") && !ret.startsWith("{") ? `(${ret})[]` : `${ret}[]`;
      const sig = `{ Args: ${args}; Returns: ${ret} }`;
      if (!byName.has(f.name)) byName.set(f.name, []);
      if (!byName.get(f.name).includes(sig)) byName.get(f.name).push(sig);
    }
    w(`${I(2)}Functions: {`);
    for (const [name, sigs] of byName) {
      w(`${I(3)}${q(name)}: ${sigs.join(" | ")};`);
    }
    w(`${I(2)}};`);

    w(`${I(2)}Enums: {`);
    for (const e of enums) {
      w(`${I(3)}${q(e.name)}: ${e.labels.map((l) => JSON.stringify(l)).join(" | ")};`);
    }
    w(`${I(2)}};`);
    w(`${I(2)}CompositeTypes: {\n${I(3)}[_ in never]: never;\n${I(2)}};`);
    w(`${I(1)}};`);
    w("};");
    w("");

    // الجزء الثابت (Tables/TablesInsert/…/Constants) من قالب Supabase نفسه.
    out += HELPERS;
    w("export const Constants = {");
    w(`${I(1)}public: {`);
    w(`${I(2)}Enums: {`);
    for (const e of enums) {
      w(`${I(3)}${q(e.name)}: [${e.labels.map((l) => JSON.stringify(l)).join(", ")}],`);
    }
    w(`${I(2)}},`);
    w(`${I(1)}},`);
    w("} as const;");

    if (CHECK) {
      const prettier = await import("prettier");
      const cfg = (await prettier.resolveConfig(OUT)) ?? {};
      const formatted = await prettier.format(out, { ...cfg, filepath: OUT });
      const current = fs.readFileSync(OUT, "utf8");
      if (formatted !== current) {
        console.error("❌ src/integrations/supabase/types.ts قديم. شغّل: npm run gen:types");
        process.exitCode = 1;
      } else console.log("✅ الأنواع مطابقة للترحيلات.");
    } else {
      const prettier = await import("prettier");
      const cfg = (await prettier.resolveConfig(OUT)) ?? {};
      fs.writeFileSync(OUT, await prettier.format(out, { ...cfg, filepath: OUT }));
      console.log(
        `✅ كُتب ${path.relative(ROOT, OUT)}: ${tables.length} جدولاً، ${views.length} عرضاً، ${byName.size} دالة، ${enums.length} تعداداً.`,
      );
    }
  } finally {
    await client.end();
    await pg.stop();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error("fatal:", e.message ?? e);
  process.exit(1);
});

const HELPERS = `type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

`;
