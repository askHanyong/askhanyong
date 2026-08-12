-- Pilot question-generation pipeline: fill out generated_questions with the
-- columns the generation JSON schema needs (section, total_marks, marks_breakdown,
-- final_answer), and add a transactional RPC so one question + its verification
-- rows are written atomically, mirroring ingest_paper's one-call-one-transaction
-- convention (see 20260812000005_ingest_function.sql).

alter table generated_questions
  add column if not exists section text check (section = any (array['A','B'])),
  add column if not exists total_marks int,
  add column if not exists marks_breakdown jsonb,
  add column if not exists final_answer text;

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
    question_text, proposed_solution, final_answer, total_marks, marks_breakdown, status
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
    payload->>'question_text',
    payload->>'proposed_solution',
    payload->>'final_answer',
    (payload->>'total_marks')::int,
    payload->'marks_breakdown',
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
