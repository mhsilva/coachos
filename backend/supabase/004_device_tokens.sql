-- FCM device tokens for push notifications
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'ios', -- 'ios' | 'android'
  created_at timestamptz not null default now(),

  constraint device_tokens_token_key unique (token)
);

-- Index for lookups when sending push to a specific user
create index if not exists idx_device_tokens_user on public.device_tokens(user_id);
