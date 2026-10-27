-- ============================================================
--  WartoWracać – elektroniczne karty lojalnościowe dla firm
--  Baza danych (Supabase / PostgreSQL), wiele lokali w jednej bazie.
--  Wklej całość w Supabase → SQL Editor → Run.
--  Skrypt można uruchomić ponownie (nie kasuje danych).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tabele ----------

-- Lokal (salon, bistro, fryzjer…) i jego ustawienia
create table if not exists public.businesses (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name          text not null check (char_length(name) between 2 and 80),
  category      text not null default 'inne',
  logo_url      text,
  color_bg      text not null default '#14110F' check (color_bg ~ '^#[0-9A-Fa-f]{6}$'),
  color_accent  text not null default '#E0B354' check (color_accent ~ '^#[0-9A-Fa-f]{6}$'),
  -- visit = pieczątka za wizytę, amount = 1 pieczątka za każde X zł
  stamp_mode    text not null default 'visit' check (stamp_mode in ('visit', 'amount')),
  amount_per_stamp numeric(8,2) check (amount_per_stamp is null or amount_per_stamp > 0),
  stamps_goal   smallint not null default 10 check (stamps_goal between 3 and 20),
  -- nagrody: [{"at":5,"label":"−15%"},{"at":10,"label":"Darmowa kawa"}]
  rewards       jsonb not null default '[{"at":10,"label":"Nagroda"}]'::jsonb,
  bday_reward   text,                               -- np. "−20% w dniu urodzin"; puste = wyłączone
  phone         text,
  address       text,
  booking_url   text,
  instagram_url text,
  facebook_url  text,
  website_url   text,
  plan          text not null default 'start' check (plan in ('start', 'pro')),
  status        text not null default 'trial' check (status in ('trial', 'active', 'paused')),
  trial_until   date not null default ((now() at time zone 'Europe/Warsaw')::date + 30),
  created_at    timestamptz not null default now()
);

-- Kto obsługuje lokal: właściciel (owner) i pracownicy (staff)
create table if not exists public.members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'staff' check (role in ('owner', 'staff')),
  can_stamp   boolean not null default true,       -- czy pracownik może dodawać pieczątki i wydawać nagrody
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);
alter table public.members add column if not exists can_stamp boolean not null default true;
create index if not exists members_user_idx on public.members(user_id);

-- Administratorzy całej usługi (właściciel WartoWracać)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- Karta klienta (jedna osoba może mieć karty w wielu lokalach)
create table if not exists public.cards (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  code             text not null unique,            -- krótki kod w QR, np. K7Q2MX
  token            text not null unique default encode(gen_random_bytes(18), 'hex'),
  name             text not null check (char_length(name) between 2 and 80),
  phone            text check (phone is null or char_length(phone) <= 30),
  bday_day         smallint check (bday_day between 1 and 31),
  bday_month       smallint check (bday_month between 1 and 12),
  stamps           smallint not null default 0 check (stamps between 0 and 20),
  cards_completed  int not null default 0,
  birthday_used_year int,
  source           text not null default 'app' check (source in ('app', 'staff')),
  created_at       timestamptz not null default now()
);
create index if not exists cards_business_idx on public.cards(business_id, created_at desc);

-- Historia: pieczątki, wydane nagrody, rabaty urodzinowe
create table if not exists public.visits (
  id          bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  card_id     uuid not null references public.cards(id) on delete cascade,
  kind        text not null check (kind in ('stamp', 'reward', 'new_card', 'birthday', 'undo')),
  stamps      smallint not null default 0,          -- ile pieczątek dodano (lub odjęto)
  amount      numeric(10,2),                        -- kwota zakupu (tryb „za kwotę”)
  label       text,                                 -- np. nazwa nagrody
  staff_id    uuid,
  created_at  timestamptz not null default now()
);
create index if not exists visits_card_idx on public.visits(card_id, created_at desc);
create index if not exists visits_business_idx on public.visits(business_id, created_at desc);

-- ---------- Bezpieczeństwo ----------
-- Tabele są zamknięte. Wszystko idzie przez funkcje poniżej,
-- które sprawdzają, czy ktoś należy do danego lokalu.

alter table public.businesses enable row level security;
alter table public.members    enable row level security;
alter table public.admins     enable row level security;
alter table public.cards      enable row level security;
alter table public.visits     enable row level security;

create or replace function public.is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where business_id = b and user_id = auth.uid());
$$;

create or replace function public.is_owner(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where business_id = b and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (user_id = auth.uid());

-- ---------- Pomocnicze ----------

create or replace function public.today_pl() returns date
language sql stable as $$ select (now() at time zone 'Europe/Warsaw')::date $$;

create or replace function public.is_bday_today(d smallint, m smallint) returns boolean
language plpgsql stable as $$
declare t date := public.today_pl();
begin
  if d is null or m is null then return false; end if;
  if m = 2 and d = 29 and extract(day from (date_trunc('year', t) + interval '1 month 28 days')) <> 29 then
    return extract(month from t) = 2 and extract(day from t) = 28;
  end if;
  return extract(month from t) = m and extract(day from t) = d;
end $$;

create or replace function public.new_code() returns text
language plpgsql volatile as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.cards where code = c);
  end loop;
  return c;
end $$;

-- Ustawienia lokalu widoczne publicznie (na karcie klienta)
create or replace function public.business_json(b public.businesses) returns json
language sql stable as $$
  select json_build_object(
    'id', b.id, 'slug', b.slug, 'name', b.name, 'category', b.category, 'logo_url', b.logo_url,
    'color_bg', b.color_bg, 'color_accent', b.color_accent,
    'stamp_mode', b.stamp_mode, 'amount_per_stamp', b.amount_per_stamp,
    'stamps_goal', b.stamps_goal, 'rewards', b.rewards, 'bday_reward', b.bday_reward,
    'phone', b.phone, 'address', b.address, 'booking_url', b.booking_url,
    'instagram_url', b.instagram_url, 'facebook_url', b.facebook_url, 'website_url', b.website_url,
    'active', b.status <> 'paused'
  );
$$;

create or replace function public.card_json(c public.cards, with_token boolean default false) returns json
language sql stable as $$
  select json_build_object(
    'id', c.id, 'code', c.code, 'name', c.name, 'phone', c.phone,
    'bday_day', c.bday_day, 'bday_month', c.bday_month,
    'stamps', c.stamps, 'cards_completed', c.cards_completed,
    'birthday_used_year', c.birthday_used_year, 'source', c.source, 'created_at', c.created_at,
    'token', case when with_token then c.token else null end,
    'bday_today', public.is_bday_today(c.bday_day, c.bday_month),
    'visits', coalesce((
      select json_agg(json_build_object('kind', v.kind, 'stamps', v.stamps, 'amount', v.amount, 'label', v.label, 'created_at', v.created_at) order by v.created_at desc)
      from (select * from public.visits where card_id = c.id order by created_at desc limit 15) v
    ), '[]'::json)
  );
$$;

-- ---------- Dla klientów (bez logowania) ----------

create or replace function public.get_business(p_slug text)
returns json language plpgsql stable security definer set search_path = public as $$
declare b public.businesses;
begin
  select * into b from public.businesses where slug = lower(trim(p_slug));
  if not found then return null; end if;
  return public.business_json(b);
end $$;

create or replace function public.register_card(p_slug text, p_name text, p_phone text, p_day int, p_month int)
returns json language plpgsql security definer set search_path = public as $$
declare b public.businesses; c public.cards;
begin
  select * into b from public.businesses where slug = lower(trim(p_slug));
  if not found or b.status = 'paused' then raise exception 'Ten lokal nie przyjmuje teraz nowych kart.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Podaj imię.'; end if;
  insert into public.cards (business_id, code, name, phone, bday_day, bday_month, source)
  values (b.id, public.new_code(), trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), p_day, p_month, 'app')
  returning * into c;
  return json_build_object('card', public.card_json(c, true), 'business', public.business_json(b));
end $$;

create or replace function public.get_my_card(p_token text)
returns json language plpgsql stable security definer set search_path = public as $$
declare c public.cards; b public.businesses;
begin
  select * into c from public.cards where token = p_token;
  if not found then return null; end if;
  select * into b from public.businesses where id = c.business_id;
  return json_build_object('card', public.card_json(c, true), 'business', public.business_json(b));
end $$;

-- ---------- Dla lokali (wymagają logowania) ----------

create or replace function public.member_check(b uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(b) then raise exception 'Brak dostępu do tego lokalu.'; end if;
end $$;

-- Pieczątki i nagrody: właściciel oraz upoważnieni pracownicy
create or replace function public.stamp_check(b uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.members where business_id = b and user_id = auth.uid() and (role = 'owner' or can_stamp)) then
    raise exception 'Nie masz uprawnień do dodawania pieczątek. Poproś właściciela lokalu.';
  end if;
end $$;

create or replace function public.owner_check(b uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner(b) then raise exception 'Tylko właściciel lokalu może to zmienić.'; end if;
end $$;

-- Nowy lokal: zakłada go zalogowana osoba i staje się właścicielem
create or replace function public.create_business(p_name text, p_slug text, p_category text)
returns json language plpgsql security definer set search_path = public as $$
declare b public.businesses; s text := lower(trim(coalesce(p_slug, '')));
begin
  if auth.uid() is null then raise exception 'Zaloguj się.'; end if;
  if (select count(*) from public.members where user_id = auth.uid() and role = 'owner') >= 5 then
    raise exception 'Masz już 5 lokali. Napisz do nas, jeśli potrzebujesz więcej.';
  end if;
  if s !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'Adres karty: 3–40 znaków, małe litery, cyfry i myślniki.'; end if;
  if exists (select 1 from public.businesses where slug = s) then raise exception 'Ten adres karty jest zajęty. Wybierz inny.'; end if;
  insert into public.businesses (name, slug, category) values (trim(p_name), s, coalesce(nullif(trim(p_category), ''), 'inne'))
  returning * into b;
  insert into public.members (business_id, user_id, role) values (b.id, auth.uid(), 'owner');
  return public.business_json(b);
end $$;

create or replace function public.my_businesses()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'business', public.business_json(b), 'role', m.role, 'can_stamp', m.role = 'owner' or m.can_stamp, 'plan', b.plan, 'status', b.status, 'trial_until', b.trial_until
  ) order by b.name), '[]'::json)
  from public.members m join public.businesses b on b.id = m.business_id
  where m.user_id = auth.uid();
$$;

create or replace function public.update_business(p_business uuid, p jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare b public.businesses; r jsonb; goal smallint;
begin
  perform public.owner_check(p_business);
  goal := coalesce((p->>'stamps_goal')::smallint, (select stamps_goal from public.businesses where id = p_business));
  r := coalesce(p->'rewards', (select rewards from public.businesses where id = p_business));
  if jsonb_typeof(r) <> 'array' or jsonb_array_length(r) = 0 or jsonb_array_length(r) > 4 then
    raise exception 'Ustaw od 1 do 4 nagród.';
  end if;
  if exists (select 1 from jsonb_array_elements(r) e
             where (e->>'at')::int < 1 or (e->>'at')::int > goal or char_length(coalesce(e->>'label', '')) not between 1 and 40) then
    raise exception 'Każda nagroda musi mieć opis i numer pieczątki od 1 do %.', goal;
  end if;
  if not exists (select 1 from jsonb_array_elements(r) e where (e->>'at')::int = goal) then
    raise exception 'Ostatnia pieczątka (nr %) musi mieć nagrodę.', goal;
  end if;
  update public.businesses set
    name          = coalesce(nullif(trim(p->>'name'), ''), name),
    category      = coalesce(nullif(trim(p->>'category'), ''), category),
    logo_url      = case when p ? 'logo_url' then nullif(trim(p->>'logo_url'), '') else logo_url end,
    color_bg      = coalesce(p->>'color_bg', color_bg),
    color_accent  = coalesce(p->>'color_accent', color_accent),
    stamp_mode    = coalesce(p->>'stamp_mode', stamp_mode),
    amount_per_stamp = case when p ? 'amount_per_stamp' then nullif(p->>'amount_per_stamp', '')::numeric else amount_per_stamp end,
    stamps_goal   = goal,
    rewards       = r,
    bday_reward   = case when p ? 'bday_reward' then nullif(trim(p->>'bday_reward'), '') else bday_reward end,
    phone         = case when p ? 'phone' then nullif(trim(p->>'phone'), '') else phone end,
    address       = case when p ? 'address' then nullif(trim(p->>'address'), '') else address end,
    booking_url   = case when p ? 'booking_url' then nullif(trim(p->>'booking_url'), '') else booking_url end,
    instagram_url = case when p ? 'instagram_url' then nullif(trim(p->>'instagram_url'), '') else instagram_url end,
    facebook_url  = case when p ? 'facebook_url' then nullif(trim(p->>'facebook_url'), '') else facebook_url end,
    website_url   = case when p ? 'website_url' then nullif(trim(p->>'website_url'), '') else website_url end
  where id = p_business returning * into b;
  if b.stamp_mode = 'amount' and b.amount_per_stamp is null then
    raise exception 'Podaj, za ile złotych jest 1 pieczątka.';
  end if;
  return public.business_json(b);
end $$;

-- Zespół: właściciel dodaje pracownika po adresie e-mail (konto musi już istnieć)
create or replace function public.list_team(p_business uuid)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public.member_check(p_business);
  return coalesce((
    select json_agg(json_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role, 'can_stamp', m.role = 'owner' or m.can_stamp, 'me', m.user_id = auth.uid()) order by m.role, u.email)
    from public.members m join auth.users u on u.id = m.user_id where m.business_id = p_business
  ), '[]'::json);
end $$;

create or replace function public.add_staff(p_business uuid, p_email text)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  perform public.owner_check(p_business);
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'Nie ma konta z tym adresem. Niech ta osoba najpierw założy konto w panelu.'; end if;
  insert into public.members (business_id, user_id, role) values (p_business, uid, 'staff') on conflict do nothing;
  return public.list_team(p_business);
end $$;

create or replace function public.set_staff_stamp(p_business uuid, p_user uuid, p_can boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_check(p_business);
  update public.members set can_stamp = p_can where business_id = p_business and user_id = p_user and role = 'staff';
  return public.list_team(p_business);
end $$;

create or replace function public.remove_staff(p_business uuid, p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_check(p_business);
  delete from public.members where business_id = p_business and user_id = p_user and role = 'staff';
  return public.list_team(p_business);
end $$;

-- Karty
create or replace function public.find_card(p_business uuid, p_code text)
returns json language plpgsql stable security definer set search_path = public as $$
declare c public.cards; k text := upper(trim(coalesce(p_code, '')));
begin
  perform public.member_check(p_business);
  -- kod może przyjść jako sam kod albo cały link z QR (…#K7Q2MX lub ?k=K7Q2MX)
  k := upper(regexp_replace(k, '^.*[#=/]', ''));
  select * into c from public.cards where business_id = p_business and code = k;
  if not found then return null; end if;
  return public.card_json(c, false);
end $$;

create or replace function public.get_card(p_card uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare c public.cards;
begin
  select * into c from public.cards where id = p_card;
  if not found then return null; end if;
  perform public.member_check(c.business_id);
  return public.card_json(c, false);
end $$;

create or replace function public.list_cards(p_business uuid, p_query text default '')
returns json language plpgsql stable security definer set search_path = public as $$
declare q text := lower(trim(coalesce(p_query, '')));
begin
  perform public.member_check(p_business);
  return coalesce((
    select json_agg(x order by x.bday_today desc, x.last_visit desc nulls last, x.name)
    from (
      select c.id, c.code, c.name, c.phone, c.stamps, c.cards_completed, c.bday_day, c.bday_month,
             public.is_bday_today(c.bday_day, c.bday_month) as bday_today,
             (select max(created_at) from public.visits v where v.card_id = c.id) as last_visit
      from public.cards c
      where c.business_id = p_business
        and (q = '' or lower(c.name) like '%' || q || '%'
             or replace(coalesce(c.phone, ''), ' ', '') like '%' || replace(q, ' ', '') || '%'
             or lower(c.code) = q)
      limit 300
    ) x
  ), '[]'::json);
end $$;

create or replace function public.create_card_staff(p_business uuid, p_name text, p_phone text, p_day int, p_month int)
returns json language plpgsql security definer set search_path = public as $$
declare c public.cards;
begin
  perform public.member_check(p_business);
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Podaj imię.'; end if;
  insert into public.cards (business_id, code, name, phone, bday_day, bday_month, source)
  values (p_business, public.new_code(), trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), p_day, p_month, 'staff')
  returning * into c;
  return public.card_json(c, true);  -- z kluczem: lokal może wysłać klientowi link do karty
end $$;

-- Pieczątki: p_count pieczątek albo kwota zakupu (tryb „za kwotę”)
create or replace function public.add_stamps(p_card uuid, p_count int, p_amount numeric default null)
returns json language plpgsql security definer set search_path = public as $$
declare c public.cards; b public.businesses; n int;
begin
  select * into c from public.cards where id = p_card for update;
  if not found then raise exception 'Nie ma takiej karty.'; end if;
  perform public.stamp_check(c.business_id);
  select * into b from public.businesses where id = c.business_id;
  if b.status = 'paused' then raise exception 'Konto lokalu jest wstrzymane. Sprawdź płatność.'; end if;
  if b.stamp_mode = 'amount' and p_amount is not null then
    n := floor(p_amount / b.amount_per_stamp)::int;
  else
    n := coalesce(p_count, 1);
  end if;
  if n < 1 then raise exception 'Ta kwota nie daje jeszcze pieczątki (1 pieczątka = % zł).', b.amount_per_stamp; end if;
  if n > b.stamps_goal then raise exception 'Za dużo pieczątek naraz.'; end if;
  if c.stamps >= b.stamps_goal then raise exception 'Karta jest pełna. Wydaj nagrodę i zacznij nową kartę.'; end if;
  n := least(n, b.stamps_goal - c.stamps);
  update public.cards set stamps = stamps + n where id = c.id returning * into c;
  insert into public.visits (business_id, card_id, kind, stamps, amount, staff_id)
  values (c.business_id, c.id, 'stamp', n, p_amount, auth.uid());
  return public.card_json(c, false);
end $$;

-- Cofnięcie ostatniej pieczątki (pomyłka)
create or replace function public.undo_stamp(p_card uuid)
returns json language plpgsql security definer set search_path = public as $$
declare c public.cards; v public.visits;
begin
  select * into c from public.cards where id = p_card for update;
  if not found then raise exception 'Nie ma takiej karty.'; end if;
  perform public.stamp_check(c.business_id);
  select * into v from public.visits where card_id = c.id order by created_at desc limit 1;
  if v.id is null or v.kind <> 'stamp' or v.created_at < now() - interval '24 hours' then
    raise exception 'Cofnąć można tylko ostatnią pieczątkę z ostatnich 24 godzin.';
  end if;
  update public.cards set stamps = greatest(0, stamps - v.stamps) where id = c.id returning * into c;
  delete from public.visits where id = v.id;
  return public.card_json(c, false);
end $$;

-- Nagroda wydana. Przy ostatniej nagrodzie karta zaczyna się od nowa.
create or replace function public.redeem_reward(p_card uuid, p_at int)
returns json language plpgsql security definer set search_path = public as $$
declare c public.cards; b public.businesses; lbl text;
begin
  select * into c from public.cards where id = p_card for update;
  if not found then raise exception 'Nie ma takiej karty.'; end if;
  perform public.stamp_check(c.business_id);
  select * into b from public.businesses where id = c.business_id;
  select e->>'label' into lbl from jsonb_array_elements(b.rewards) e where (e->>'at')::int = p_at;
  if lbl is null then raise exception 'Nie ma nagrody przy tej pieczątce.'; end if;
  if c.stamps < p_at then raise exception 'Za mało pieczątek na tę nagrodę (na karcie: %).', c.stamps; end if;
  if exists (select 1 from public.visits where card_id = c.id and kind = 'reward' and label = lbl
             and created_at > coalesce((select max(created_at) from public.visits where card_id = c.id and kind = 'new_card'), c.created_at)) then
    raise exception 'Ta nagroda została już wydana na tej karcie.';
  end if;
  insert into public.visits (business_id, card_id, kind, label, staff_id) values (c.business_id, c.id, 'reward', lbl, auth.uid());
  if p_at >= b.stamps_goal then
    update public.cards set stamps = 0, cards_completed = cards_completed + 1 where id = c.id returning * into c;
    insert into public.visits (business_id, card_id, kind, staff_id) values (c.business_id, c.id, 'new_card', auth.uid());
  end if;
  return public.card_json(c, false);
end $$;

create or replace function public.use_birthday(p_card uuid)
returns json language plpgsql security definer set search_path = public as $$
declare c public.cards; b public.businesses; y int := extract(year from public.today_pl());
begin
  select * into c from public.cards where id = p_card for update;
  if not found then raise exception 'Nie ma takiej karty.'; end if;
  perform public.stamp_check(c.business_id);
  select * into b from public.businesses where id = c.business_id;
  if b.bday_reward is null then raise exception 'Lokal nie ma prezentu urodzinowego.'; end if;
  if not public.is_bday_today(c.bday_day, c.bday_month) then raise exception 'Prezent urodzinowy działa tylko w dniu urodzin.'; end if;
  if c.birthday_used_year = y then raise exception 'Prezent urodzinowy został już wykorzystany w tym roku.'; end if;
  update public.cards set birthday_used_year = y where id = c.id returning * into c;
  insert into public.visits (business_id, card_id, kind, label, staff_id) values (c.business_id, c.id, 'birthday', b.bday_reward, auth.uid());
  return public.card_json(c, false);
end $$;

create or replace function public.delete_card(p_card uuid)
returns void language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  select business_id into bid from public.cards where id = p_card;
  if bid is null then return; end if;
  perform public.owner_check(bid);
  delete from public.cards where id = p_card;
end $$;

-- Proste statystyki dla właściciela
create or replace function public.business_stats(p_business uuid)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public.member_check(p_business);
  return json_build_object(
    'cards', (select count(*) from public.cards where business_id = p_business),
    'new_30', (select count(*) from public.cards where business_id = p_business and created_at > now() - interval '30 days'),
    'stamps_30', (select coalesce(sum(stamps), 0) from public.visits where business_id = p_business and kind = 'stamp' and created_at > now() - interval '30 days'),
    'rewards_30', (select count(*) from public.visits where business_id = p_business and kind = 'reward' and created_at > now() - interval '30 days'),
    'returning_30', (select count(distinct card_id) from public.visits v where v.business_id = p_business and v.kind = 'stamp' and v.created_at > now() - interval '30 days'
                       and exists (select 1 from public.visits w where w.card_id = v.card_id and w.kind = 'stamp' and w.created_at < v.created_at))
  );
end $$;

-- ---------- Dla administratora usługi ----------

create or replace function public.admin_list()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak dostępu.'; end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name, 'category', b.category, 'plan', b.plan, 'status', b.status,
      'trial_until', b.trial_until, 'created_at', b.created_at,
      'owner', (select u.email from public.members m join auth.users u on u.id = m.user_id where m.business_id = b.id and m.role = 'owner' limit 1),
      'cards', (select count(*) from public.cards c where c.business_id = b.id),
      'stamps_30', (select coalesce(sum(stamps), 0) from public.visits v where v.business_id = b.id and v.kind = 'stamp' and v.created_at > now() - interval '30 days')
    ) order by b.created_at desc)
    from public.businesses b
  ), '[]'::json);
end $$;

create or replace function public.admin_set(p_business uuid, p_plan text, p_status text, p_trial_until date)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Brak dostępu.'; end if;
  update public.businesses set
    plan = coalesce(p_plan, plan), status = coalesce(p_status, status), trial_until = coalesce(p_trial_until, trial_until)
  where id = p_business;
  return public.admin_list();
end $$;

-- ---------- Uprawnienia do funkcji ----------

revoke all on all functions in schema public from public, anon;
grant execute on function public.get_business(text), public.register_card(text, text, text, int, int), public.get_my_card(text) to anon, authenticated;
grant execute on function
  public.create_business(text, text, text), public.my_businesses(), public.update_business(uuid, jsonb),
  public.list_team(uuid), public.add_staff(uuid, text), public.remove_staff(uuid, uuid), public.set_staff_stamp(uuid, uuid, boolean),
  public.find_card(uuid, text), public.get_card(uuid), public.list_cards(uuid, text), public.create_card_staff(uuid, text, text, int, int),
  public.add_stamps(uuid, int, numeric), public.undo_stamp(uuid), public.redeem_reward(uuid, int), public.use_birthday(uuid),
  public.delete_card(uuid), public.business_stats(uuid), public.admin_list(), public.admin_set(uuid, text, text, date),
  public.is_member(uuid), public.is_owner(uuid), public.is_admin()
to authenticated;

-- ---------- Logo lokali (Storage) ----------
-- Publiczny folder „logos”. Plik trafia do katalogu o nazwie = id lokalu,
-- a wgrać go może tylko właściciel tego lokalu.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists logos_owner_write on storage.objects;
create policy logos_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.is_owner(((storage.foldername(name))[1])::uuid));

drop policy if exists logos_owner_update on storage.objects;
create policy logos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.is_owner(((storage.foldername(name))[1])::uuid));

drop policy if exists logos_owner_delete on storage.objects;
create policy logos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.is_owner(((storage.foldername(name))[1])::uuid));

-- Po założeniu swojego konta w panelu uruchom (z Twoim adresem e-mail),
-- żeby mieć dostęp do panelu administratora:
-- insert into public.admins (user_id) select id from auth.users where email = 'TWOJ@EMAIL.pl';
