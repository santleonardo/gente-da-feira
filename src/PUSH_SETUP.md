# Push Notifications — Setup

## 1. Gerar chaves VAPID

```bash
npx web-push generate-vapid-keys
```

Copie os valores para `.env.local`:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key gerada>
VAPID_PRIVATE_KEY=<private key gerada>
VAPID_SUBJECT=mailto:contato@gentedafeira.app
```

## 2. Criar tabela no Supabase

Execute no SQL Editor do Supabase:

```sql
CREATE TABLE push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text UNIQUE NOT NULL,
  subscription jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário gerencia suas próprias subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);
```

## 3. Instalar dependência para enviar notificações

```bash
npm install web-push
npm install -D @types/web-push
```

## 4. Enviar notificação (exemplo)

```ts
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

await webpush.sendNotification(
  JSON.parse(subscriptionFromDB),
  JSON.stringify({
    title: "Gente da Feira",
    body: "Alguém curtiu seu post!",
    url: "/",
    tag: "like-notification",
  })
);
```
