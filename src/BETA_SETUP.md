# Beta público — Ambiente isolado + Kill switches

Guia dos itens **4** e **7** do plano light.

## 4. Ambiente isolado

Não use o projeto Supabase de produção no beta.

### Checklist

1. **Crie um projeto Supabase novo** só para o beta  
   - Dashboard → New project  
   - Anote URL, `anon` key e `service_role` key  

2. **Rode o schema** (`SQL.txt`) nesse projeto (SQL Editor)

3. **Gere segredos exclusivos** (nunca copie de outro ambiente):

```bash
# INTERNAL_API_SECRET (≥ 32 chars)
openssl rand -hex 32

# Par VAPID novo
npx web-push generate-vapid-keys
```

4. **Configure na Vercel** (Project → Settings → Environment Variables):

| Variável | Origem |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Projeto beta |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Projeto beta |
| `SUPABASE_SERVICE_ROLE_KEY` | Projeto beta |
| `NEXT_PUBLIC_APP_URL` | URL do deploy beta |
| `INTERNAL_API_SECRET` | Novo (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Novo |
| `VAPID_PRIVATE_KEY` | Novo |
| `VAPID_MAILTO` | Seu e-mail |

5. **Auth no Supabase beta**  
   - Authentication → URL Configuration → Site URL = URL do beta  
   - Redirect URLs: `https://seu-beta.vercel.app/**`  

6. **Moderador** (você):

```sql
UPDATE public.profiles
SET is_moderator = true
WHERE username = 'seu_usuario';
```

7. **Storage**  
   - Confirme os buckets criados pelo SQL  
   - No free tier, acompanhe uso em Storage → Usage  

---

## 7. Kill switches

Ative/desative sem alterar código — só variável de ambiente + redeploy (ou redeploy automático se a Vercel aplicar env).

| Flag | Efeito |
|---|---|
| `KILL_SWITCH_SIGNUP=1` | API de cadastro retorna **503** |
| `NEXT_PUBLIC_KILL_SWITCH_SIGNUP=1` | Esconde aba “Criar conta” no UI |
| `KILL_SWITCH_READONLY=1` | Bloqueia posts, comentários, msgs DM/sala e criação de salas |

Valores aceitos como ligado: `1`, `true`, `yes`, `on`.

### Cenários

**Volume de teste maior que o esperado**

```
KILL_SWITCH_SIGNUP=1
NEXT_PUBLIC_KILL_SWITCH_SIGNUP=1
```

**Abuso de conteúdo — app continua no ar, só leitura**

```
KILL_SWITCH_READONLY=1
```

**Emergência combinada**

```
KILL_SWITCH_SIGNUP=1
NEXT_PUBLIC_KILL_SWITCH_SIGNUP=1
KILL_SWITCH_READONLY=1
```

### Monitoramento rápido (beta)

- Logs da Vercel: filtre `[SEC-`, `[middleware]`, `[auth/register]`
- Supabase → Database → Usage / Storage Usage  
- Painel de denúncias (conta com `is_moderator = true`)  
- Alerta manual: se storage > ~70% do free (1 GB), ative `KILL_SWITCH_READONLY` ou reduza ainda mais uploads  

---

## Ordem sugerida no dia do deploy

1. Projeto Supabase beta + SQL  
2. Env vars na Vercel (incluindo kill switches = `0`)  
3. Deploy  
4. Criar sua conta → marcar `is_moderator`  
5. Testar cadastro, post com 1 foto, denúncia, painel admin  
6. Só então divulgar o link  
