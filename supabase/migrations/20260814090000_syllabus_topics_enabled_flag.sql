-- hanmath.com's topic picker only shows topics the pilot has actually
-- generated/verified questions for. syllabus_topics had no such flag yet --
-- add one, default false (opt-in), and enable exactly the 3 pilot topics
-- (Optimization, Kinematics-adjacent AA5.9, Complex Numbers polar form).
alter table public.syllabus_topics
  add column topics_enabled boolean not null default false;

update public.syllabus_topics
  set topics_enabled = true
  where code in ('AA5.8', 'AA5.9', 'AA1.13');
