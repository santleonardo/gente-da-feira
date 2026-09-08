# Segurança e monitoramento de segredos

## O que nunca commitamos

- `.env`, `.env.local`, `.env.production` (já no `.gitignore` via `.env*`)
- `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `GEMINI_API_KEY`
- `INTERNAL_API_SECRET`, `CRON_SECRET`, `UPSTASH_REDIS_REST_TOKEN`
- Chaves PEM / JWT de service role

Use apenas `.env.example` com **placeholders**.

## Monitoramento automático

| Camada | Onde |
|--------|------|
| Script local/CI | `node scripts/check-secrets.mjs` |
| GitHub Actions | `.github/workflows/secret-scan.yml` (padrão + Gitleaks) |
| GitHub Secret Scanning | Automático em repos públicos; em privados com GitHub Advanced Security |
| Vercel | Env vars no dashboard (não no Git); não logar secrets |

### Rodar localmente

```bash
npm run check:secrets
```

### Pré-commit (opcional)

```bash
# .git/hooks/pre-commit ou husky
npm run check:secrets
```

## Se um segredo vazar

1. **Revogar/rotacionar** no provedor (Supabase, Google AI, Upstash, VAPID).
2. Atualizar a variável na **Vercel** (Production + Preview).
3. Remover do histórico Git se foi commitado (`git filter-repo` / suporte GitHub).
4. Redeploy.

## Variáveis públicas vs secretas

Ver auditoria no projeto: apenas `NEXT_PUBLIC_*` no client. Service role e API keys **só no servidor**.
