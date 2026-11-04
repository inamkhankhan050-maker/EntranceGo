do $$
declare r record; cid uuid; mid uuid; s text; n int; pos int; total int;
begin
for r in select * from (values
  ('ssc-cgl','SSC CGL','SSC Combined Graduate Level','verbal-reasoning,general-knowledge,aptitude,english',2,0.5),
  ('ssc-chsl','SSC CHSL','SSC CHSL (10+2)','verbal-reasoning,general-knowledge,aptitude,english',2,0.5),
  ('ssc-mts','SSC MTS','SSC Multi-Tasking Staff','verbal-reasoning,general-knowledge,aptitude,english',3,1),
  ('ssc-gd','SSC GD Constable','SSC GD Constable','verbal-reasoning,general-knowledge,aptitude,english,hindi',2,0.5),
  ('ssc-cpo','SSC CPO','SSC CPO (Sub-Inspector)','verbal-reasoning,general-knowledge,aptitude,english',1,0.25),
  ('ssc-je','SSC JE','SSC Junior Engineer','verbal-reasoning,general-knowledge',1,0.25),
  ('rrb-ntpc','RRB NTPC','RRB NTPC','aptitude,verbal-reasoning,general-knowledge',1,0.33),
  ('rrb-group-d','RRB Group D','RRB Group D','aptitude,verbal-reasoning,general-knowledge,general-science',1,0.33),
  ('rrb-alp','RRB ALP','RRB Assistant Loco Pilot','aptitude,verbal-reasoning,general-knowledge,general-science',1,0.33),
  ('rrb-technician','RRB Technician','RRB Technician','aptitude,verbal-reasoning,general-knowledge,general-science',1,0.33),
  ('rrb-section-controller','RRB Section Controller','RRB Section Controller','aptitude,verbal-reasoning,general-knowledge',1,0.33)
) as t(slug, name, full_name, subs, mk, neg) loop
  insert into public.courses (slug, name, description, status, sort_order)
  values (r.slug, r.name, 'Full-length mock tests for ' || r.full_name || '.', 'published', 1)
  on conflict (slug) do nothing;
  select id into cid from public.courses where slug = r.slug;

  insert into public.course_questions (course_id, question_id)
  select cid, q.id from public.questions q join public.subjects sb on sb.id = q.subject_id
  where q.status = 'published' and sb.slug = any (string_to_array(r.subs, ','))
  on conflict do nothing;

  if not exists (select 1 from public.mock_tests where slug = r.slug || '-mock-test-1') then
    insert into public.mock_tests (course_id, slug, title, description, instructions, total_questions, duration_minutes, marks_per_question, negative_marks, status)
    values (cid, r.slug || '-mock-test-1', r.name || ' Mock Test 1', 'A full-length practice mock in the ' || r.name || ' pattern.',
            'Each correct answer gets ' || r.mk || ' mark(s) and each wrong answer loses ' || r.neg || '. Unanswered questions score 0. The test is submitted automatically when the timer ends.',
            0, 5, r.mk, r.neg, 'draft')
    returning id into mid;
    pos := 0; total := 0;
    foreach s in array string_to_array(r.subs, ',') loop
      select least(5, count(*)) into n from public.course_questions cq join public.questions q on q.id = cq.question_id
       join public.subjects sb on sb.id = q.subject_id where cq.course_id = cid and sb.slug = s and q.status = 'published';
      if n > 0 then
        insert into public.mock_test_sections (mock_id, subject_id, question_count, position)
        select mid, id, n, pos from public.subjects where slug = s;
        pos := pos + 1; total := total + n;
      end if;
    end loop;
    update public.mock_tests set total_questions = total, duration_minutes = greatest(5, total),
           status = case when total > 0 then 'published' else 'draft' end where id = mid;
  end if;
end loop;
end $$;
