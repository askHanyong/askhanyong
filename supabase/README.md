# IB Math AA question bank — Supabase migrations

Four migrations, applied in order:

1. `20260812000001_schema.sql` — the 12 core tables (subjects, syllabus
   topics, papers, questions, question parts, mark schemes, topic tags,
   review queue, classes, student access, generated questions + their
   verification records).
2. `20260812000002_rls.sql` — `admins` table, `is_admin()` helper, RLS
   enabled on every table, and the access policies (private exam content is
   admin-only; `generated_questions` is public for `status = 'published'`
   rows; `classes`/`student_access` are scoped to the owning admin plus the
   student's own row). See the comment at the top of the file for two access
   calls made on tables the original spec didn't cover.
3. `20260812000003_storage.sql` — three private storage buckets
   (`papers-private`, `markschemes-private`, `question-images`) with
   admin-only read/write policies.
4. `20260812000004_seed.sql` — seeds `subjects` with the MAA row.

## Running it

You need the [Supabase CLI](https://supabase.com/docs/guides/cli) and your
project's ref (Project Settings → General → Reference ID).

```bash
# one-time: link this repo checkout to your Supabase project
supabase link --project-ref <your-project-ref>

# apply all pending migrations under supabase/migrations/
supabase db push
```

`supabase db push` runs the four files above in filename order against your
linked project's Postgres database, then applies the storage bucket/policy
statements the same way (they're plain SQL, run through the same migration
mechanism).

## Making yourself the admin

`admins.id` is a bare foreign key to `auth.users(id)` with no self-serve
sign-up path — insert your own row once you have an auth user:

```sql
insert into admins (id) values ('<your-auth-user-uuid>');
```

Run that in the Supabase SQL editor (or via `psql`) after your first sign-in,
using the service role — RLS on `admins` only allows an existing admin to
`select`, and there's intentionally no `insert` policy for anyone but
migrations/service-role SQL.
