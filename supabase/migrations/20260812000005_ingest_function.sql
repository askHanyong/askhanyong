-- IB Math AA question bank: transactional bulk-ingest RPC for the paper/markscheme
-- ingestion script (scripts/ingest-paper). One call = one Postgres function
-- invocation = one implicit transaction: any error rolls back everything the
-- call would otherwise have inserted for that paper.
--
-- Handles three shapes coming from scripts/ingest-paper/src/reconcile.ts:
--   1. payload.questions[].parts            -- paper parts, each optionally carrying
--                                               a matched .markscheme sub-object and/or
--                                               a .mismatch_reason when unmatched
--   2. payload.questions[].orphan_markscheme_parts
--                                            -- markscheme parts with no matching paper
--                                               part label; inserted as stub question_parts
--                                               so review_queue (question_part_id NOT NULL)
--                                               has something concrete to point reviewers at
--   3. payload.orphan_markscheme_questions  -- whole questions the markscheme has that the
--                                               paper segmentation missed entirely; same
--                                               stub treatment, at the question level too
--
-- Not exposed to anon/authenticated: only ever called with the service role key from
-- the ingestion script, so it stays admin/backend-only regardless of table RLS.

create or replace function ingest_paper(payload jsonb)
returns uuid
language plpgsql
as $$
declare
  v_paper_id uuid;
  v_question jsonb;
  v_question_id uuid;
  v_part jsonb;
  v_part_id uuid;
  v_orphan_question jsonb;
  v_label_to_id jsonb;
  v_next_order int;
begin
  insert into papers (
    subject_id, level, year, session, paper_number, time_zone,
    calculator_allowed, total_marks, paper_file_path, markscheme_file_path
  )
  select
    (payload->'paper'->>'subject_id')::uuid,
    payload->'paper'->>'level',
    (payload->'paper'->>'year')::int,
    payload->'paper'->>'session',
    (payload->'paper'->>'paper_number')::int,
    payload->'paper'->>'time_zone',
    (payload->'paper'->>'calculator_allowed')::boolean,
    (payload->'paper'->>'total_marks')::int,
    payload->'paper'->>'paper_file_path',
    payload->'paper'->>'markscheme_file_path'
  returning id into v_paper_id;

  for v_question in select * from jsonb_array_elements(payload->'questions')
  loop
    insert into questions (paper_id, question_number, total_marks)
    values (v_paper_id, (v_question->>'question_number')::int, (v_question->>'total_marks')::int)
    returning id into v_question_id;

    v_label_to_id := '{}'::jsonb;

    for v_part in select * from jsonb_array_elements(v_question->'parts')
    loop
      insert into question_parts (
        question_id, part_label, part_text, image_refs, marks, command_term, order_index
      )
      values (
        v_question_id,
        v_part->>'part_label',
        v_part->>'part_text',
        case when v_part ? 'image_refs'
          then array(select jsonb_array_elements_text(v_part->'image_refs'))
          else null end,
        (v_part->>'marks')::int,
        v_part->>'command_term',
        (v_part->>'order_index')::int
      )
      returning id into v_part_id;

      v_label_to_id := jsonb_set(v_label_to_id, array[v_part->>'part_label'], to_jsonb(v_part_id::text));

      if v_part->'markscheme' is not null then
        insert into markscheme_parts (question_part_id, markscheme_text, marks_breakdown)
        values (v_part_id, v_part->'markscheme'->>'markscheme_text', v_part->'markscheme'->'marks_breakdown');
      end if;

      if v_part->>'mismatch_reason' is not null then
        insert into review_queue (question_part_id, reason) values (v_part_id, v_part->>'mismatch_reason');
      end if;
    end loop;

    -- second pass: resolve depends_on_part_label -> depends_on_part_id within this question
    for v_part in select * from jsonb_array_elements(v_question->'parts')
    loop
      if v_part->>'depends_on_part_label' is not null then
        update question_parts
        set depends_on_part_id = (v_label_to_id->>(v_part->>'depends_on_part_label'))::uuid
        where id = (v_label_to_id->>(v_part->>'part_label'))::uuid;
      end if;
    end loop;

    -- markscheme parts with no matching paper part: stub question_parts for manual review
    select coalesce(max((p->>'order_index')::int), -1) + 1
    into v_next_order
    from jsonb_array_elements(v_question->'parts') p;

    for v_part in select * from jsonb_array_elements(coalesce(v_question->'orphan_markscheme_parts', '[]'::jsonb))
    loop
      insert into question_parts (question_id, part_label, part_text, marks, order_index)
      values (
        v_question_id,
        v_part->>'part_label',
        '[unresolved: no matching paper text found -- see review_queue]',
        coalesce(jsonb_array_length(v_part->'marks_breakdown'), 0),
        v_next_order
      )
      returning id into v_part_id;
      v_next_order := v_next_order + 1;

      insert into markscheme_parts (question_part_id, markscheme_text, marks_breakdown)
      values (v_part_id, v_part->>'markscheme_text', v_part->'marks_breakdown');

      insert into review_queue (question_part_id, reason)
      values (v_part_id, v_part->>'mismatch_reason');
    end loop;
  end loop;

  -- whole questions the markscheme has but the paper segmentation missed entirely
  for v_orphan_question in select * from jsonb_array_elements(coalesce(payload->'orphan_markscheme_questions', '[]'::jsonb))
  loop
    insert into questions (paper_id, question_number, total_marks)
    values (v_paper_id, (v_orphan_question->>'question_number')::int, null)
    returning id into v_question_id;

    for v_part in select * from jsonb_array_elements(v_orphan_question->'parts')
    loop
      insert into question_parts (question_id, part_label, part_text, marks, order_index)
      values (
        v_question_id,
        v_part->>'part_label',
        '[unresolved: question missing from paper segmentation -- see review_queue]',
        coalesce(jsonb_array_length(v_part->'marks_breakdown'), 0),
        (v_part->>'order_index')::int
      )
      returning id into v_part_id;

      insert into markscheme_parts (question_part_id, markscheme_text, marks_breakdown)
      values (v_part_id, v_part->>'markscheme_text', v_part->'marks_breakdown');

      insert into review_queue (question_part_id, reason)
      values (v_part_id, v_part->>'mismatch_reason');
    end loop;
  end loop;

  return v_paper_id;
end;
$$;

revoke execute on function ingest_paper(jsonb) from public;
revoke execute on function ingest_paper(jsonb) from anon, authenticated;
grant execute on function ingest_paper(jsonb) to service_role;
