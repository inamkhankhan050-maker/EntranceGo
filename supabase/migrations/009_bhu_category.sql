-- 009: add the BHU ENTRANCE EXAM category and store the real names of the exam categories.
insert into public.categories (slug, name, description, sort_order)
values ('bhu-entrance-exam', 'BHU ENTRANCE EXAM', 'UG & PG entrance exams at Banaras Hindu University.', 5)
on conflict (slug) do nothing;
update public.categories set name = 'University Entrance Exams' where slug = 'competitive-exams';
update public.categories set name = 'CUET ENTRANCE EXAM' where slug = 'engineering-gate';
update public.categories set name = 'JMI ENTRANCE EXAM' where slug = 'graduation-postgraduate';
update public.categories set name = 'AMU ENTRANCE EXAM' where slug = 'interview-preparation';
