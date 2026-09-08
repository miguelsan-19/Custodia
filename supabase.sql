-- ============================================
--  CUSTODIA  ·  Esquema Supabase
--  Pega todo este bloque en: Supabase > SQL Editor > New query > Run
--
--  IMPORTANTE: todo se crea dentro del esquema "cuentas"
--  para NO interferir con las tablas de tus otros proyectos.
-- ============================================

create schema if not exists cuentas;

create extension if not exists pgcrypto;

-- Configuración global (contraseña cifrada, moneda)
create table if not exists cuentas.settings (
  id integer primary key check (id = 1),
  setup boolean not null default false,
  currency text not null default 'S/',
  salt text,
  password_hash text
);

insert into cuentas.settings (id) values (1) on conflict (id) do nothing;

-- Personas dueñas del dinero
create table if not exists cuentas.persons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Impide nombres duplicados sin importar mayúsculas/minúsculas
create unique index if not exists uniq_persons_lower_name
  on cuentas.persons (lower(name));

-- Movimientos (ingreso / egreso / transferencia)
create table if not exists cuentas.movements (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references cuentas.persons(id) on delete restrict,
  to_person_id uuid references cuentas.persons(id) on delete restrict,
  type text not null check (type in ('ingreso','egreso','transferencia')),
  amount bigint not null check (amount > 0),
  date date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_movements_person on cuentas.movements(person_id);
create index if not exists idx_movements_date on cuentas.movements(date);

-- Sesiones activas
create table if not exists cuentas.sessions (
  token text primary key,
  created_at timestamptz not null default now()
);

-- ============================================
--  APARTADO: TARJETAS DE CRÉDITO (gastos propios)
--  Estas compras NO se mezclan con el saldo compartido.
-- ============================================

create table if not exists cuentas.cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  last4 text not null default '',
  credit_limit bigint check (credit_limit is null or credit_limit > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_cards_lower_name
  on cuentas.cards (lower(name));

create table if not exists cuentas.card_purchases (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cuentas.cards(id) on delete restrict,
  date date not null,
  concept text not null,
  amount bigint not null check (amount > 0),
  installments integer not null default 1 check (installments between 1 and 120),
  paid_installments integer not null default 0
    check (paid_installments between 0 and installments),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_card_purchases_card on cuentas.card_purchases(card_id);
create index if not exists idx_card_purchases_date on cuentas.card_purchases(date);