-- IB Math AA question bank: admin helper + row level security
--
-- Assumption (not covered by the original spec, flagged here rather than guessed
-- silently): `subjects` and `syllabus_topics` are curriculum taxonomy/labels, not
-- exam content, and the public generator will eventually need them for browsing/
-- filtering, so they get public SELECT + admin-only writes. `generated_question_
-- verification` holds internal QA data with no public use case, so it's treated
-- like the other admin-only content tables. Revisit either call if that's wrong.

create table admins (
  id uuid primary key references auth.users(id)
);

alter table admins enable row level security;

-- security definer so RLS on `admins` itself doesn't recurse into this check
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from admins where id = auth.uid());
$$;

-- only an admin can see who else is an admin; nobody but the row owner can be added here directly (seeding is done via SQL, not the API)
create policy "admins_select_admin_only"
  on admins for select
  using (is_admin());

alter table subjects enable row level security;
alter table syllabus_topics enable row level security;
alter table papers enable row level security;
alter table questions enable row level security;
alter table question_parts enable row level security;
alter table markscheme_parts enable row level security;
alter table part_topic_tags enable row level security;
alter table review_queue enable row level security;
alter table classes enable row level security;
alter table student_access enable row level security;
alter table generated_questions enable row level security;
alter table generated_question_verification enable row level security;

-- taxonomy: public read, admin write
create policy "subjects_public_read"
  on subjects for select
  using (true);
create policy "subjects_admin_write"
  on subjects for all
  using (is_admin())
  with check (is_admin());

create policy "syllabus_topics_public_read"
  on syllabus_topics for select
  using (true);
create policy "syllabus_topics_admin_write"
  on syllabus_topics for all
  using (is_admin())
  with check (is_admin());

-- private exam content: admin only, all commands
create policy "papers_admin_only"
  on papers for all
  using (is_admin())
  with check (is_admin());

create policy "questions_admin_only"
  on questions for all
  using (is_admin())
  with check (is_admin());

create policy "question_parts_admin_only"
  on question_parts for all
  using (is_admin())
  with check (is_admin());

create policy "markscheme_parts_admin_only"
  on markscheme_parts for all
  using (is_admin())
  with check (is_admin());

create policy "part_topic_tags_admin_only"
  on part_topic_tags for all
  using (is_admin())
  with check (is_admin());

create policy "review_queue_admin_only"
  on review_queue for all
  using (is_admin())
  with check (is_admin());

-- classes: only the owning admin can see or manage their own classes
create policy "classes_owning_admin_only"
  on classes for all
  using (owner_id = auth.uid() and is_admin())
  with check (owner_id = auth.uid() and is_admin());

-- student_access: the owning admin manages rows; a student can read their own row
create policy "student_access_owning_admin_manage"
  on student_access for all
  using (
    exists (
      select 1 from classes c
      where c.id = student_access.class_id
        and c.owner_id = auth.uid()
        and is_admin()
    )
  )
  with check (
    exists (
      select 1 from classes c
      where c.id = student_access.class_id
        and c.owner_id = auth.uid()
        and is_admin()
    )
  );

create policy "student_access_student_read_own"
  on student_access for select
  using (student_user_id = auth.uid());

-- generated_questions: public can read published rows, admin manages everything
create policy "generated_questions_public_read_published"
  on generated_questions for select
  using (status = 'published');

create policy "generated_questions_admin_manage"
  on generated_questions for all
  using (is_admin())
  with check (is_admin());

-- generated_question_verification: internal QA data, admin only
create policy "generated_question_verification_admin_only"
  on generated_question_verification for all
  using (is_admin())
  with check (is_admin());
