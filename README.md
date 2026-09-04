# ClimaGDF — Bot de clima + alertas para Gente da Feira

Pacote pronto para integrar:

- Conta dedicada `@clima_gdf` (Clima Feira)
- Webhook de alertas manuais/externos
- Cron Open-Meteo (previsão diária + alertas)
- Log de execuções em `weather_runs`

---

## Arquivos

```
clima-gdf/
├── README.md
├── sql/
│   └── 01_weather_runs.sql       ← rodar no Supabase
└── src/
    ├── lib/
    │   ├── weather-bot.ts        ← resolve bot + publish
    │   └── weather-run-log.ts    ← start/finish do log
    └── app/api/
        ├── internal/weather-alert/route.ts
        └── cron/weather/route.ts
```

Copie os arquivos de `src/` para o mesmo caminho no projeto Gente da Feira.

---

## Setup (ordem)

### 1. SQL

No Supabase → SQL Editor, rode `sql/01_weather_runs.sql`.

### 2. Conta do bot

1. **Authentication → Users → Add user**
   - Email: `clima@gentedafeira.local` (ou real)
   - Auto Confirm: sim
   - Copie o **User UID**

2. Complete o profile:

```sql
UPDATE public.profiles
SET
  username       = 'clima_gdf',
  display_name   = 'Clima Feira',
  bio            = 'Previsão do tempo e alertas de Feira de Santana. Informação útil, sem enrolação.',
  is_weather_bot = true,
  is_city_bot    = false
WHERE id = 'UUID-DO-USUARIO';
```

Se a linha não existir:

```sql
INSERT INTO public.profiles (id, username, display_name, bio, is_weather_bot, is_city_bot)
VALUES (
  'UUID-DO-USUARIO',
  'clima_gdf',
  'Clima Feira',
  'Previsão do tempo e alertas de Feira de Santana. Informação útil, sem enrolação.',
  true,
  false
)
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  display_name = EXCLUDED.display_name,
  bio = EXCLUDED.bio,
  is_weather_bot = true,
  is_city_bot = false;
```

### 3. Variáveis de ambiente (Vercel)

```
WEATHER_BOT_USER_ID=<uuid-do-usuario>
INTERNAL_API_SECRET=<já existente, ≥ 32 chars>
```

Redeploy após salvar.

### 4. Código

Copie:

| Destino no projeto | Arquivo deste pacote |
|--------------------|----------------------|
| `src/lib/weather-bot.ts` | `src/lib/weather-bot.ts` |
| `src/lib/weather-run-log.ts` | `src/lib/weather-run-log.ts` |
| `src/app/api/internal/weather-alert/route.ts` | idem |
| `src/app/api/cron/weather/route.ts` | idem |

### 5. Cron (Vercel)

Os crons já estão no `vercel.json` do projeto (array `crons`): previsão diária, checagem horária de alertas e ingestão de notícias da Cidade.

| Schedule | Efeito (BRT) |
|----------|----------------|
| `0 9 * * *` | ~06h — previsão diária |
| `15 * * * *` | a cada hora — alertas |

---

## Testes

### Webhook manual

```bash
curl -X POST https://SEU-APP.vercel.app/api/internal/weather-alert \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "warning",
    "title": "Teste conta ClimaGDF",
    "body": "Se você vê este post, a conta dedicada está ok.",
    "source": "Setup",
    "external_id": "setup-climagdf-001"
  }'
```

### Cron

```bash
curl -X GET https://SEU-APP.vercel.app/api/cron/weather \
  -H "Authorization: Bearer $INTERNAL_API_SECRET"
```

### Log

```sql
SELECT
  started_at AT TIME ZONE 'America/Bahia' AS started_brt,
  status,
  posted_count,
  duration_ms,
  sample,
  error_message
FROM public.weather_runs
ORDER BY started_at DESC
LIMIT 10;
```

---

## Severidades (webhook)

| severity   | Posta no feed?              | Uso                    |
|------------|-----------------------------|------------------------|
| `info`     | só com `force_post: true`   | dica / previsão leve   |
| `watch`    | sim                         | atenção                |
| `warning`  | sim                         | alerta                 |
| `emergency`| sim                         | emergência             |

---

## Observações

- Open-Meteo **não exige API key**.
- Posts saem como autor **Clima Feira** (`@clima_gdf`), não como conta Cidade.
- Idempotência por `external_id` nas últimas 24h.
- Limite diário padrão: 100 posts (mesmo teto da conta Cidade).
- Log é best-effort: falha ao gravar `weather_runs` não quebra o cron.
