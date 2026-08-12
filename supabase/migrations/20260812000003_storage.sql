-- IB Math AA question bank: private storage buckets
--
-- All three buckets store content that backs admin-only tables (papers,
-- question_parts' image_refs), so they're kept fully private end-to-end:
-- admin-only upload AND admin-only read. The app serves files to end users
-- (e.g. a student's own script, a published generated question) via signed
-- URLs minted server-side with the service role key, which bypasses these
-- policies entirely -- these policies only govern direct client access.

insert into storage.buckets (id, name, public)
values
  ('papers-private', 'papers-private', false),
  ('markschemes-private', 'markschemes-private', false),
  ('question-images', 'question-images', false)
on conflict (id) do nothing;

create policy "papers_private_admin_only"
  on storage.objects for all
  using (bucket_id = 'papers-private' and is_admin())
  with check (bucket_id = 'papers-private' and is_admin());

create policy "markschemes_private_admin_only"
  on storage.objects for all
  using (bucket_id = 'markschemes-private' and is_admin())
  with check (bucket_id = 'markschemes-private' and is_admin());

create policy "question_images_admin_only"
  on storage.objects for all
  using (bucket_id = 'question-images' and is_admin())
  with check (bucket_id = 'question-images' and is_admin());
