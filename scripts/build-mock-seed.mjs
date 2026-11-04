// Generates supabase/seed_mock.sql: Hindi subject, original B.Ed-style starter questions, the B.Ed course,
// its question links and a starter mock. Lookups are by slug/text, so it is safe on any database and re-runnable.
import { writeFileSync } from 'node:fs';
const S = (s) => "'" + String(s).replace(/'/g, "''") + "'";
// [subject, difficulty, question, correct, wrong1, wrong2, wrong3, explanation]
const Q = [
  ['hindi', 'easy', "'सूर्य' का पर्यायवाची शब्द कौन-सा है?", 'दिनकर', 'निशाकर', 'सुधाकर', 'हिमकर', 'दिनकर का अर्थ है दिन करने वाला, अर्थात् सूर्य। बाकी तीनों चंद्रमा के पर्यायवाची हैं।'],
  ['hindi', 'easy', "'अमृत' का विलोम शब्द कौन-सा है?", 'विष', 'जल', 'मधु', 'दूध', 'अमृत का उल्टा विष है।'],
  ['hindi', 'easy', "'कमल' का पर्यायवाची शब्द कौन-सा है?", 'पंकज', 'भ्रमर', 'मधुकर', 'कुसुमाकर', 'पंकज (कीचड़ में जन्मा) कमल का पर्यायवाची है।'],
  ['hindi', 'easy', "'राम ने खाना खाया' — इस वाक्य में क्रिया कौन-सी है?", 'खाया', 'राम', 'खाना', 'ने', 'जिस शब्द से काम का होना पता चले वह क्रिया है: खाया।'],
  ['hindi', 'medium', "'विद्यालय' का सही संधि-विच्छेद क्या है?", 'विद्या + आलय', 'विद्य + आलय', 'विद्या + लय', 'विद + आलय', 'आ + आ = आ (दीर्घ संधि): विद्या + आलय = विद्यालय।'],
  ['hindi', 'medium', "'हिमालय' का सही संधि-विच्छेद क्या है?", 'हिम + आलय', 'हिमा + लय', 'हि + मालय', 'हिम + लय', 'अ + आ = आ (दीर्घ संधि): हिम + आलय = हिमालय।'],
  ['hindi', 'medium', "'जो ईश्वर में विश्वास रखता हो' — इसके लिए एक शब्द क्या है?", 'आस्तिक', 'नास्तिक', 'धार्मिक', 'पुजारी', 'ईश्वर में विश्वास रखने वाला आस्तिक कहलाता है; न रखने वाला नास्तिक।'],
  ['hindi', 'medium', "'आँख का तारा' मुहावरे का अर्थ क्या है?", 'बहुत प्यारा', 'आँख का रोग', 'आसमान का तारा', 'बहुत दूर का व्यक्ति', 'आँख का तारा होना = बहुत प्यारा होना।'],
  ['hindi', 'easy', "'पुस्तक' शब्द का बहुवचन क्या है?", 'पुस्तकें', 'पुस्तको', 'पुस्तकाएँ', 'पुस्तकी', 'स्त्रीलिंग अकारांत शब्द का बहुवचन -एँ लगाकर बनता है: पुस्तकें।'],
  ['hindi', 'easy', "'सुंदर लड़की गा रही है' — इस वाक्य में 'सुंदर' कौन-सा पद है?", 'विशेषण', 'संज्ञा', 'क्रिया', 'सर्वनाम', 'सुंदर, संज्ञा (लड़की) की विशेषता बताता है, इसलिए विशेषण है।'],
  ['hindi', 'easy', "'वह स्कूल जाता है' — इस वाक्य में 'वह' कौन-सा पद है?", 'सर्वनाम', 'संज्ञा', 'विशेषण', 'अव्यय', 'संज्ञा के स्थान पर आने वाला शब्द सर्वनाम कहलाता है।'],
  ['hindi', 'hard', "'नीलकंठ' में कौन-सा समास है?", 'बहुव्रीहि', 'द्वंद्व', 'द्विगु', 'अव्ययीभाव', 'नीला है कंठ जिसका, अर्थात् शिव: अन्य पद प्रधान होने से बहुव्रीहि समास।'],
  ['english', 'easy', "Choose the word closest in meaning to 'Brave'.", 'Courageous', 'Timid', 'Lazy', 'Careless', 'Brave means showing courage, so Courageous is the synonym.'],
  ['english', 'easy', "Choose the word opposite in meaning to 'Victory'.", 'Defeat', 'Success', 'Triumph', 'Win', 'Defeat is the opposite of victory.'],
  ['english', 'easy', "Fill in the blank with the correct article: He is ___ honest man.", 'an', 'a', 'the', 'no article', "'Honest' begins with a vowel sound (the h is silent), so we use 'an'."],
  ['english', 'easy', "What is the plural of 'child'?", 'children', 'childs', 'childes', 'childrens', "'Child' has an irregular plural: children."],
  ['english', 'medium', "Identify the noun in the sentence: 'The cat sleeps on the mat.'", 'cat', 'sleeps', 'on', 'the', "'Cat' names an animal, so it is a noun ('mat' is also a noun but is not offered)."],
  ['english', 'medium', "Choose the correct passive form: 'She writes a letter.'", 'A letter is written by her.', 'A letter was written by her.', 'A letter is wrote by her.', 'A letter has written by her.', 'Simple present active becomes is/am/are + past participle in the passive.'],
  ['computer-fundamentals', 'easy', 'Which of the following is an input device?', 'Scanner', 'Printer', 'Monitor', 'Speaker', 'A scanner sends data into the computer; the others show or play output.'],
  ['computer-fundamentals', 'easy', 'What is the full form of RAM?', 'Random Access Memory', 'Read Access Memory', 'Rapid Action Memory', 'Run All Memory', 'RAM stands for Random Access Memory.'],
  ['computer-fundamentals', 'easy', 'Which part is called the brain of the computer?', 'CPU', 'Monitor', 'Keyboard', 'Mouse', 'The CPU carries out instructions and controls the other parts.'],
  ['computer-fundamentals', 'easy', 'Which keyboard shortcut pastes copied content in Windows?', 'Ctrl + V', 'Ctrl + C', 'Ctrl + P', 'Ctrl + Z', 'Ctrl + V pastes; Ctrl + C copies, Ctrl + P prints, Ctrl + Z undoes.'],
  ['computer-fundamentals', 'medium', 'Which of the following is a web browser?', 'Google Chrome', 'MS Word', 'Windows 11', 'Tally', 'Google Chrome is used to open websites.'],
  ['computer-fundamentals', 'medium', 'Which memory keeps its data when the power is switched off?', 'ROM', 'RAM', 'Cache', 'Register', 'ROM is non-volatile; RAM, cache and registers lose data without power.'],
];
const shuffle = (arr, seed) => { const a = [...arr]; let s = seed; for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
let sql = `-- EntranceGo: B.Ed starter content for mock tests (generated by scripts/build-mock-seed.mjs). Safe to re-run.
insert into public.subjects (slug, name, description, icon, status, sort_order)
values ('hindi', 'Hindi', 'हिंदी व्याकरण: पर्यायवाची, विलोम, संधि, समास, मुहावरे और पद परिचय।', 'Languages', 'published', 2)
on conflict (slug) do nothing;
insert into public.subject_categories (subject_id, category_id)
select s.id, c.id from public.subjects s, public.categories c where s.slug = 'hindi' and c.slug = 'competitive-exams'
on conflict do nothing;

insert into public.questions (subject_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, tags, source, difficulty, status)
values\n`;
sql += Q.map(([subj, diff, q, c, ...rest], i) => {
  const expl = rest.pop(); const opts = shuffle([c, ...rest], i * 7 + 3); const letter = 'ABCD'[opts.indexOf(c)];
  return `  ((select id from public.subjects where slug = ${S(subj)}), ${S(q)}, ${opts.map(S).join(', ')}, '${letter}', ${S(expl)}, array[${S(subj)}, 'b-ed'], 'EntranceGo original', '${diff}', 'published')`;
}).join(',\n') + '\non conflict do nothing;\n\n';
sql += `insert into public.courses (slug, name, description, status, sort_order)
values ('b-ed', 'B.Ed Entrance', 'Full-length mock tests for B.Ed entrance exams: English, Hindi and Computer.', 'published', 0)
on conflict (slug) do nothing;

-- Link every published English, Hindi and Computer question to the B.Ed course question bank.
insert into public.course_questions (course_id, question_id)
select c.id, q.id from public.courses c
join public.questions q on q.status = 'published'
join public.subjects s on s.id = q.subject_id and s.slug in ('english', 'hindi', 'computer-fundamentals')
where c.slug = 'b-ed'
on conflict do nothing;

insert into public.mock_tests (course_id, slug, title, description, instructions, total_questions, duration_minutes, marks_per_question, negative_marks, status)
select c.id, 'b-ed-mock-test-1', 'B.Ed Entrance Mock Test 1',
       'A full mock with English, Hindi and Computer sections in the B.Ed entrance pattern.',
       'Each correct answer gets 1 mark and each wrong answer loses 0.25 marks. Unanswered questions score 0. The test is submitted automatically when the timer ends.',
       15, 15, 1, 0.25, 'published'
from public.courses c where c.slug = 'b-ed'
on conflict (slug) do nothing;

insert into public.mock_test_sections (mock_id, subject_id, question_count, position)
select m.id, s.id, 5, x.pos
from public.mock_tests m
join (values ('english', 0), ('hindi', 1), ('computer-fundamentals', 2)) as x(slug, pos) on true
join public.subjects s on s.slug = x.slug
where m.slug = 'b-ed-mock-test-1'
on conflict (mock_id, subject_id) do nothing;
`;
writeFileSync(new URL('../supabase/seed_mock.sql', import.meta.url), sql);
console.log('seed_mock.sql:', Q.length, 'questions');
