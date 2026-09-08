#!/usr/bin/env node
/**
 * Monitoramento básico de segredos no repositório.
 *
 * - Falha (exit 1) se encontrar padrões de credenciais em arquivos versionáveis
 * - Ignora node_modules, .next, .git, artifacts, .env* (não devem estar no git)
 * - Use no pre-commit / CI: `node scripts/check-secrets.mjs`
 *
 * NÃO substitui GitHub Secret Scanning / Gitleaks / rotação de chaves.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  "coverage",
  "dist",
  "build",
  "out",
  "artifacts",
  ".turbo",
]);

const SKIP_FILES = new Set([
  "check-secrets.mjs", // este script
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".toml",
  ".env",
  ".txt",
  ".sql",
  ".css",
  ".html",
  ".svg",
]);

/** Padrões de alto risco (valor real, não placeholder) */
const RULES = [
  {
    id: "supabase-service-role-jwt",
    description: "Possível JWT de service_role Supabase",
    // JWT eyJ... com 3 segmentos longos
    re: /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\b/g,
    // permite exemplos curtos / óbvios placeholders
    allow: (m) =>
      /sua-|your-|example|placeholder|xxx|changeme/i.test(m) || m.length < 80,
  },
  {
    id: "google-api-key",
    description: "Possível Google/Gemini API key (AIza...)",
    re: /\bAIza[0-9A-Za-z_-]{20,}\b/g,
    allow: (m) => /example|placeholder|xxx/i.test(m),
  },
  {
    id: "aws-access-key",
    description: "Possível AWS Access Key ID",
    re: /\bAKIA[0-9A-Z]{16}\b/g,
    allow: () => false,
  },
  {
    id: "private-key-block",
    description: "Bloco de chave privada PEM",
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    allow: () => false,
  },
  {
    id: "vapid-or-hex-secret-assignment",
    description: "Atribuição de segredo com valor hex longo (possível INTERNAL/CRON/VAPID)",
    re: /\b(SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY|INTERNAL_API_SECRET|CRON_SECRET|GEMINI_API_KEY|UPSTASH_REDIS_REST_TOKEN)\s*[=:]\s*['"][^'"]{16,}['"]/gi,
    allow: (m) =>
      /sua-|your-|example|placeholder|xxx|changeme|aqui|dummy/i.test(m),
  },
  {
    id: "slack-or-github-token",
    description: "Possível token GitHub/Slack",
    re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    allow: () => false,
  },
];

const findings = [];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      await walk(full);
      continue;
    }
    if (SKIP_FILES.has(ent.name)) continue;
    // .env* não deve estar commitado; se estiver, reportar de forma especial
    if (ent.name.startsWith(".env") && ent.name !== ".env.example") {
      findings.push({
        file: relative(ROOT, full),
        rule: "env-file-committed",
        description: "Arquivo .env versionado (deve estar só no .gitignore)",
        match: ent.name,
      });
      continue;
    }
    const ext = extname(ent.name);
    if (ext && !TEXT_EXT.has(ext) && !ent.name.startsWith(".env")) continue;

    let st;
    try {
      st = await stat(full);
    } catch {
      continue;
    }
    if (st.size > 1_500_000) continue; // pula arquivos enormes

    let content;
    try {
      content = await readFile(full, "utf8");
    } catch {
      continue;
    }

    const rel = relative(ROOT, full);
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(content)) !== null) {
        const match = m[0];
        if (rule.allow && rule.allow(match)) continue;
        // .env.example com placeholders
        if (rel.endsWith(".env.example") && /sua-|your-|example|aqui|changeme/i.test(match)) {
          continue;
        }
        findings.push({
          file: rel,
          rule: rule.id,
          description: rule.description,
          match: match.length > 60 ? match.slice(0, 40) + "…" : match,
        });
      }
    }
  }
}

await walk(ROOT);

if (findings.length === 0) {
  console.log("✓ check-secrets: nenhum segredo óbvio encontrado nos arquivos varridos.");
  process.exit(0);
}

console.error("✗ check-secrets: possíveis segredos detectados:\n");
for (const f of findings) {
  console.error(`  [${f.rule}] ${f.file}`);
  console.error(`    ${f.description}`);
  console.error(`    match: ${f.match}\n`);
}
console.error(
  "Remova os valores reais do Git, rode `git rm --cached` se preciso, e rotacione as chaves."
);
process.exit(1);
