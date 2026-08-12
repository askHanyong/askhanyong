-- IB Math AA question bank: core schema
-- gen_random_uuid() ships in Postgres core on Supabase (PG13+); pgcrypto kept as a safe fallback.
create extension if not exists pgcrypto with schema extensions;

create table subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);

create table syllabus_topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects(id) not null,
  code text not null,
  topic_number int not null,
  topic_name text not null,
  subtopic_name text not null,
  level_scope text not null check (level_scope in ('SL','AHL')),
  parent_topic_id uuid references syllabus_topics(id),
  unique (subject_id, code)
);

create table papers (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects(id) not null,
  level text not null check (level in ('SL','HL')),
  year int not null,
  session text not null check (session in ('May','Nov')),
  paper_number int not null check (paper_number in (1,2,3)),
  time_zone text,
  calculator_allowed boolean not null,
  total_marks int,
  paper_file_path text,
  markscheme_file_path text,
  created_at timestamptz default now(),
  unique (subject_id, level, year, session, paper_number, time_zone)
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid references papers(id) not null,
  question_number int not null,
  total_marks int,
  unique (paper_id, question_number)
);

create table question_parts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions(id) not null,
  part_label text not null,
  part_text text not null,
  image_refs text[],
  marks int not null,
  command_term text,
  depends_on_part_id uuid references question_parts(id),
  order_index int not null,
  unique (question_id, part_label)
);

create table markscheme_parts (
  id uuid primary key default gen_random_uuid(),
  question_part_id uuid references question_parts(id) not null unique,
  markscheme_text text not null,
  marks_breakdown jsonb
);

create table part_topic_tags (
  id uuid primary key default gen_random_uuid(),
  question_part_id uuid references question_parts(id) not null,
  topic_id uuid references syllabus_topics(id) not null,
  is_primary boolean not null default false,
  confidence numeric(4,3),
  tagged_by text not null check (tagged_by in ('ai','human')),
  reviewed boolean not null default false,
  unique (question_part_id, topic_id)
);

create table review_queue (
  id uuid primary key default gen_random_uuid(),
  question_part_id uuid references question_parts(id) not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_notes text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) not null
);

create table student_access (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) not null,
  student_user_id uuid references auth.users(id) not null,
  unique (class_id, student_user_id)
);

create table generated_questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references subjects(id) not null,
  primary_topic_id uuid references syllabus_topics(id) not null,
  secondary_topic_ids uuid[],
  level text not null check (level in ('SL','HL')),
  difficulty text check (difficulty in ('easy','medium','hard')),
  question_text text not null,
  proposed_solution text not null,
  status text not null default 'draft' check (status in ('draft','verified','flagged','published')),
  created_at timestamptz default now()
);

create table generated_question_verification (
  id uuid primary key default gen_random_uuid(),
  generated_question_id uuid references generated_questions(id) not null,
  method text not null check (method in ('sympy','llm_independent','human')),
  passed boolean not null,
  result jsonb,
  created_at timestamptz default now()
);
