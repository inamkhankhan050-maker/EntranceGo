import Papa from 'papaparse';
import { normText, OPTIONS, optKey, DIFFICULTIES } from './text.js';
import { validateQuestion } from './validate.js';

export const CSV_COLUMNS = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option', 'explanation', 'subject', 'topic', 'difficulty', 'status', 'exam', 'tags', 'source', 'image_url'];
export const REQUIRED_COLUMNS = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option', 'subject'];

export const SAMPLE_CSV = Papa.unparse({
  fields: CSV_COLUMNS,
  data: [
    ['What is 20% of 150?', '20', '25', '30', '35', 'C', '20% of 150 = 0.2 × 150 = 30.', 'aptitude', 'percentage', 'easy', 'draft', 'ssc-cgl', 'percentage;basics', 'EntranceGo original', ''],
    ["Which Python keyword is used to create a class?", 'class', 'def', 'object', 'struct', 'A', "Classes are created with the 'class' keyword.", 'python', 'python-basics', 'easy', 'published', '', 'python;oop', '', ''],
  ],
});

const findBy = (list, v, fields = ['slug', 'name']) => {
  const n = normText(v);
  return n ? list.find((x) => fields.some((f) => normText(x[f]) === n)) : undefined;
};

/**
 * Parse + validate a CSV for import. Nothing is written here.
 * existing: [{subject_id, question}] already in the database, for duplicate detection.
 */
export function parseQuestionCSV(text, { subjects, topics, exams, existing = [] }) {
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim().toLowerCase() });
  const fileErrors = [];
  const headers = parsed.meta.fields || [];
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length) fileErrors.push(`Missing required column(s): ${missing.join(', ')}.`);
  if (!parsed.data.length) fileErrors.push('The file has no data rows.');
  parsed.errors.slice(0, 5).forEach((er) => fileErrors.push(`Row ${(er.row ?? 0) + 2}: ${er.message}`));
  if (missing.length) return { rows: [], fileErrors };

  const rows = buildImportRows(parsed.data.map((r, i) => ({ ...r, rowNumber: i + 2 })), { subjects, topics, exams, existing }); // header is row 1
  return { rows, fileErrors };
}

/**
 * Validate already-parsed records (CSV-column keys + rowNumber) and mark duplicates. Shared by the CSV and Word/PDF importers.
 */
export function buildImportRows(records, { subjects, topics, exams, existing = [] }) {
  const existingKeys = new Set(existing.map((q) => q.subject_id + '|' + normText(q.question)));
  const fileKeys = new Map();
  return records.map((r) => {
    const rowNumber = r.rowNumber;
    const errors = [];
    const subject = findBy(subjects, r.subject);
    if (!subject) errors.push(r.subject ? `Unknown subject "${r.subject}".` : 'Subject is required.');
    let topic = null;
    if (r.topic && subject) {
      topic = findBy(topics.filter((t) => t.subject_id === subject.id), r.topic);
      if (!topic) errors.push(`Topic "${r.topic}" does not exist under ${subject.name}.`);
    }
    let exam = null;
    if (r.exam) { exam = findBy(exams, r.exam); if (!exam) errors.push(`Unknown exam "${r.exam}".`); }
    const correct = String(r.correct_option || '').trim().toUpperCase().replace(/^OPTION[_ ]?/, '');
    const difficulty = String(r.difficulty || 'medium').trim().toLowerCase();
    const status = String(r.status || 'draft').trim().toLowerCase();
    const data = {
      subject_id: subject?.id || null, topic_id: topic?.id || null, exam_id: exam?.id || null,
      question: (r.question || '').trim(),
      option_a: (r.option_a || '').trim(), option_b: (r.option_b || '').trim(), option_c: (r.option_c || '').trim(), option_d: (r.option_d || '').trim(),
      correct_option: correct, explanation: (r.explanation || '').trim() || null,
      difficulty, status,
      tags: String(r.tags || '').split(/[;|]/).map((t) => t.trim()).filter(Boolean),
      source: (r.source || '').trim() || null, image_url: (r.image_url || '').trim() || null,
    };
    if (!DIFFICULTIES.includes(difficulty)) errors.push(`Difficulty "${r.difficulty}" must be easy, medium or hard.`);
    if (!['draft', 'published'].includes(status)) errors.push(`Status "${r.status}" must be draft or published.`);
    if (!OPTIONS.includes(correct)) errors.push(`Correct option "${r.correct_option || ''}" must be A, B, C or D.`);
    const v = validateQuestion(data, { topics });
    ['question', ...OPTIONS.map(optKey), 'image_url'].forEach((k) => v[k] && errors.push(v[k]));

    let state = errors.length ? 'invalid' : 'valid';
    if (state === 'valid') {
      const key = data.subject_id + '|' + normText(data.question);
      if (existingKeys.has(key)) { state = 'duplicate'; errors.push('Already exists in the question bank.'); }
      else if (fileKeys.has(key)) { state = 'duplicate'; errors.push(`Duplicate of row ${fileKeys.get(key)} in this file.`); }
      else fileKeys.set(key, rowNumber);
    }
    return { rowNumber, data, errors, state, label: { subject: subject?.name || r.subject, topic: topic?.name || r.topic || '' } };
  });
}

export function questionsToCSV(questions, { subjects, topics, exams }) {
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const S = byId(subjects), T = byId(topics), E = byId(exams);
  return Papa.unparse({
    fields: CSV_COLUMNS,
    data: questions.map((q) => [q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation || '',
      S[q.subject_id]?.slug || '', T[q.topic_id]?.slug || '', q.difficulty, q.status, E[q.exam_id]?.slug || '', (q.tags || []).join(';'), q.source || '', q.image_url || '']),
  });
}

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\uFEFF' + text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
