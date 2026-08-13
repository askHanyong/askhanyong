-- Two pilot-review fixes:
-- 1. calculator_allowed: the pilot's AA5.9 "hard" question was written as a
--    full hand-derivation (antiderivative, sign-split, exact e-fractions) but
--    if positioned as a Paper 2 question the same part collapses to "evaluate
--    the definite integral on a GDC" -- one step. The correct solution PATH
--    and the difficulty rating both depend on calculator availability, so it
--    has to be a generation INPUT (like level/section/difficulty), not a
--    label applied after the fact.
-- 2. needs_diagram/diagram_description/diagram_svg: the pilot's box-folding
--    optimization question (cut squares from a cardboard sheet, fold up the
--    sides) is materially harder to follow without a diagram, the way real
--    exam papers include one. Mirrors question_parts.image_refs from the
--    ingestion side, but since generated questions have no source PDF to
--    reference, we additionally generate an actual SVG from the description.

alter table generated_questions
  add column if not exists calculator_allowed boolean,
  add column if not exists needs_diagram boolean not null default false,
  add column if not exists diagram_description text,
  add column if not exists diagram_svg text;

create or replace function insert_generated_question(payload jsonb)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_check jsonb;
begin
  insert into generated_questions (
    subject_id, primary_topic_id, secondary_topic_ids, level, section, difficulty,
    calculator_allowed, question_text, proposed_solution, final_answer, total_marks,
    marks_breakdown, needs_diagram, diagram_description, diagram_svg, status
  )
  values (
    (payload->>'subject_id')::uuid,
    (payload->>'primary_topic_id')::uuid,
    case when payload ? 'secondary_topic_ids' and jsonb_array_length(payload->'secondary_topic_ids') > 0
      then array(select (jsonb_array_elements_text(payload->'secondary_topic_ids'))::uuid)
      else null end,
    payload->>'level',
    payload->>'section',
    payload->>'difficulty',
    (payload->>'calculator_allowed')::boolean,
    payload->>'question_text',
    payload->>'proposed_solution',
    payload->>'final_answer',
    (payload->>'total_marks')::int,
    payload->'marks_breakdown',
    coalesce((payload->>'needs_diagram')::boolean, false),
    payload->>'diagram_description',
    payload->>'diagram_svg',
    coalesce(payload->>'status', 'draft')
  )
  returning id into v_id;

  for v_check in select * from jsonb_array_elements(coalesce(payload->'verifications', '[]'::jsonb))
  loop
    insert into generated_question_verification (generated_question_id, method, passed, result)
    values (v_id, v_check->>'method', (v_check->>'passed')::boolean, v_check->'result');
  end loop;

  return v_id;
end;
$$;

revoke execute on function insert_generated_question(jsonb) from public;
revoke execute on function insert_generated_question(jsonb) from anon, authenticated;
grant execute on function insert_generated_question(jsonb) to service_role;
