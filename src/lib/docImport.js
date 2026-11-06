// Word (.docx) and PDF question import.
// Files are read entirely in the browser; nothing is uploaded anywhere until the admin confirms the import.
import { normText, OPTIONS, optKey } from './text.js';

export const DOC_SAMPLE = `1. The price of a book rises from ₹200 to ₹250. What is the percentage increase?
A) 20%
B) 25%
C) 30%
D) 50%
Answer: B
Explanation: Increase = 50. 50 ÷ 200 × 100 = 25%.

2. Which Python keyword is used to create a class?
A) class
B) def
C) object
D) struct
Answer: A`;

const STATEMENT = /^(?:\(?\d{1,2}[.)]|\(?[ivx]{1,4}[.)]|[•\-–*])\s*/i;

// A list item coming from Word's automatic numbering. depth 0 = top level.
const LI = '\u0001LI';

const RE = {
  qStart: /^(?:Q(?:uestion)?\s*\.?\s*|प्रश्न\s*)?(\d{1,4})\s*[.):\-–](?!\d)\s*(.*)$/i,
  qLabelOnly: /^Q(?:uestion)?\s*\.?\s*(\d{1,4})\s*[.):\-–]?\s*(.*)$/i,
  answer: /^(?:ans(?:wer)?|correct\s+(?:answer|option)|right\s+answer|उत्तर|सही\s*उत्तर)\s*(?:is\s*)?(?:[:.\-–=]\s*(.+)|\s*\(?([A-Da-d])\)?\.?)$/i,
  explanation: /^(?:explanation|solution|exp|reason|व्याख्या|हल)\s*[:.\-–]\s*(.*)$/i,
  optStart: /^\(?([A-Da-d])\s*[).:]\s*(.*)$/,
};

// Split "A) 20% B) 25% C) 30% D) 50%" (all on one line) into [['A','20%'], ...]
function splitOptions(line) {
  const first = line.match(RE.optStart);
  if (!first) return null;
  const upper = first[1] === first[1].toUpperCase();
  const re = upper ? /(?:^|\s)\(?([A-D])\s*[).:]\s*/g : /(?:^|\s)\(?([a-d])\s*[).:]\s*/g;
  const marks = [];
  let m;
  while ((m = re.exec(line))) marks.push({ L: m[1].toUpperCase(), at: m.index, end: re.lastIndex });
  // keep only markers that run A, B, C, D in order from the first one
  const seq = [];
  for (const mk of marks) { const want = OPTIONS[OPTIONS.indexOf(marks[0].L) + seq.length]; if (mk.L === want) seq.push(mk); }
  return seq.map((mk, i) => [mk.L, line.slice(mk.end, i + 1 < seq.length ? seq[i + 1].at : undefined).trim()]);
}

function parseAnswer(rest) {
  const s = rest.trim().replace(/^option\s*/i, '');
  const m = s.match(/^\(?([A-Da-d])\)?(?=$|[\s.):\]-])/);
  return m ? { letter: m[1].toUpperCase() } : { text: s };
}

/**
 * Turn plain text into question records. Returns { records, warnings }.
 * Each record: { rowNumber, question, option_a..d, correct_option, explanation }.
 */
export function parseQuestionText(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\u00a0/g, ' ').trim()).filter(Boolean);
  const qs = [];
  let cur = null;
  let field = null;
  let lastOpt = null;

  const start = (num, txt) => {
    cur = { num, question: txt || '', options: {}, answer: null, explanation: '' };
    qs.push(cur); field = 'question'; lastOpt = null;
  };
  const optCount = () => (cur ? Object.keys(cur.options).length : 0);
  const append = (txt) => {
    if (field === 'question') {
      // after a list of statements, a new sentence goes on its own line
      const lastLine = cur.question.split('\n').pop();
      const nl = cur.question.includes('\n') && (/[.?!:]$/.test(lastLine) || STATEMENT.test(lastLine)) && /^[A-Z(]/.test(txt);
      cur.question = (cur.question + (nl ? '\n' : ' ') + txt).trim();
    }
    else if (field === 'option' && lastOpt) cur.options[lastOpt] = (cur.options[lastOpt] + ' ' + txt).trim();
    else if (field === 'explanation') cur.explanation = (cur.explanation + ' ' + txt).trim();
  };
  const setOption = (L, txt) => { cur.options[L] = txt; lastOpt = L; field = 'option'; };

  // Is there an option list ahead (before the next Answer line)? Used to tell a new numbered question
  // from numbered points inside an explanation.
  const optionsAhead = (i) => {
    for (let j = i + 1; j < Math.min(lines.length, i + 25); j++) {
      const t = lines[j].replace(/^\u0001LI\d+\|/, '');
      if (RE.optStart.test(t)) return true;
      if (RE.answer.test(t) || RE.explanation.test(t)) return false;
    }
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i];
    let li = null;
    if (raw.startsWith(LI)) { const m = raw.match(/^\u0001LI(\d+)\|(.*)$/); li = { depth: +m[1] }; raw = m[2].trim(); if (!raw) continue; }
    let m;

    if ((m = raw.match(RE.explanation)) && cur) { cur.explanation = m[1]; field = 'explanation'; continue; }
    if (cur && !cur.answer && optCount() >= 2 && (m = raw.match(RE.answer))) { cur.answer = parseAnswer(m[1] || m[2]); field = 'answer'; continue; }
    if ((m = raw.match(RE.qStart)) || (m = raw.match(RE.qLabelOnly))) {
      const labelled = /^(Q|प्रश्न)/i.test(raw);
      // Numbered statements inside a question ("Consider the following: 1. ... 2. ...") stay part of it
      // while the question has no options yet.
      if (cur && !labelled && optCount() === 0 && !cur.answer && field === 'question' && cur.question) {
        cur.question += '\n' + raw; continue;
      }
      // Numbered points inside an explanation stay there unless a new option list follows.
      if (cur && !labelled && field === 'explanation' && !(+m[1] === cur.num + 1 && optionsAhead(i))) { append(raw); continue; }
      start(+m[1], m[2]); continue;
    }
    if (cur && !cur.answer && (m = raw.match(RE.optStart))) {
      const parts = splitOptions(raw);
      if (parts && parts.length) { parts.forEach(([L, t]) => setOption(L, t)); continue; }
    }
    if (li) {
      // Word auto-numbered list item without typed numbers/letters.
      if (cur && !cur.answer && field !== 'explanation' && (li.depth > 0 || (cur.question && optCount() < 4))) {
        setOption(OPTIONS[optCount()] || 'D', raw); continue;
      }
      start(qs.length + 1, raw); continue;
    }
    if (!cur || (cur.answer && field !== 'explanation')) { start(qs.length + 1, raw); continue; }
    if (field === 'question' && STATEMENT.test(raw)) { cur.question += '\n' + raw; continue; }
    append(raw);
  }

  const warnings = [];
  const records = qs.map((q, i) => {
    let correct = q.answer?.letter || '';
    if (!correct && q.answer?.text) {
      const hit = OPTIONS.find((L) => q.options[L] && normText(q.options[L]) === normText(q.answer.text));
      correct = hit || q.answer.text;
    }
    const r = { rowNumber: i + 1, question: q.question, correct_option: correct, explanation: q.explanation };
    OPTIONS.forEach((L) => { r[optKey(L)] = q.options[L] || ''; });
    return r;
  });
  if (!records.length) warnings.push('No questions were found. Check that each question follows the format shown above.');
  return { records, warnings };
}

// ---------- table layout ("Question | ... ", "Option | ... | Correct", "Solution | B") ----------
// Many quiz tools export each question as a small table with a label column. We read those rows directly.

const LABELS = { question: 'question', 'question text': 'question', type: 'type', option: 'option', options: 'option', solution: 'answer', answer: 'answer', 'correct answer': 'answer', marks: 'marks', explanation: 'explanation' };
const labelOf = (s) => LABELS[String(s || '').trim().toLowerCase().replace(/[:\s]+$/, '')] || null;
const STATUS = /^(correct|incorrect|right|wrong)$/i;

/** cells: [{ label, text, status }] in reading order → { records, warnings } */
export function recordsFromCells(cells) {
  const qs = [];
  let cur = null;
  for (const c of cells) {
    const kind = labelOf(c.label);
    if (kind === 'question') { cur = { question: c.text.trim().replace(/\s+['"‘’`]$/, ''), options: [], correct: [], answer: '', explanation: '' }; qs.push(cur); continue; }
    if (!cur) continue;
    if (kind === 'option') { cur.options.push(c.text.trim()); if (/^(correct|right)$/i.test(c.status || '')) cur.correct.push(cur.options.length - 1); }
    else if (kind === 'answer') cur.answer = c.text.trim();
    else if (kind === 'explanation') cur.explanation = (cur.explanation + ' ' + c.text).trim();
  }
  const records = qs.map((q, i) => {
    const r = { rowNumber: i + 1, question: q.question, explanation: q.explanation };
    OPTIONS.forEach((L, k) => { r[optKey(L)] = q.options[k] || ''; });
    let correct = '';
    const m = q.answer.match(/^\(?([A-Da-d])\)?$/) || q.answer.match(/^option\s*\(?([A-Da-d])\)?$/i);
    if (m) correct = m[1].toUpperCase();
    else if (q.answer) correct = OPTIONS.find((L, k) => q.options[k] && normText(q.options[k]) === normText(q.answer)) || q.answer;
    if (!correct && q.correct.length === 1) correct = OPTIONS[q.correct[0]] || '';
    r.correct_option = correct;
    return r;
  });
  return { records, warnings: records.length ? [] : ['No questions were found.'] };
}
export const looksLikeTable = (cells) => cells.filter((c) => labelOf(c.label) === 'question').length > 0 && cells.filter((c) => labelOf(c.label) === 'option').length >= 2;

// Join the lines of one cell: numbered statements keep their own line.
const joinCellLines = (lines) => lines.reduce((acc, l) => (!acc ? l : acc + (STATEMENT.test(l) || /^Which\b|^Select\b|^Choose\b/.test(l) || /[?:]$/.test(acc) ? '\n' : ' ') + l), '');

/** pages: [[{ x, y, str }]] (PDF coordinates, y grows upwards) → cells in reading order, or [] if not a label table */
export function pdfItemsToCells(pages) {
  const all = pages.flatMap((items, p) => items.filter((i) => i.str.trim()).map((i) => ({ ...i, p, str: i.str.trim() })));
  const labelItems = all.filter((i) => labelOf(i.str));
  if (!labelItems.length) return [];
  const minX = Math.min(...labelItems.map((i) => i.x));
  const isLabel = (i) => labelOf(i.str) && i.x <= minX + 8;
  const cells = [];
  pages.forEach((_, p) => {
    const labels = all.filter((i) => i.p === p && isLabel(i)).map((l) => ({ ...l, kind: labelOf(l.str), lines: [], status: '' }));
    if (!labels.length) return;
    const content = all.filter((i) => i.p === p && !isLabel(i) && i.x > minX + 20);
    const shortFits = (kind, str) => (kind === 'type' ? /^[a-z_ -]+$/i.test(str) && str.length < 30 : kind === 'marks' ? /^[-\d.\s]+$/.test(str) : kind === 'answer' ? str.length < 60 : true);
    const byDist = (y) => [...labels].sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y));
    // status column (Correct / Incorrect) goes to the option on the same line
    content.filter((c) => STATUS.test(c.str)).forEach((c) => { const o = byDist(c.y).find((l) => l.kind === 'option'); if (o) o.status = c.str; });
    // group the rest into visual lines, then into cells: lines closer than ~1.4 line-heights belong together
    const rows = [];
    content.filter((c) => !STATUS.test(c.str)).sort((a, b) => b.y - a.y).forEach((it) => {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
      if (row) row.parts.push(it); else rows.push({ y: it.y, parts: [it] });
    });
    const groups = [];
    rows.forEach((r) => { const g = groups[groups.length - 1]; if (g && g.minY - r.y <= 18) { g.rows.push(r); g.minY = r.y; } else groups.push({ maxY: r.y, minY: r.y, rows: [r] }); });
    for (const g of groups) {
      const text = g.rows.map((r) => r.parts.map((x) => x.str).join(' ')).join(' ');
      const inside = labels.filter((l) => l.y >= g.minY - 6 && l.y <= g.maxY + 6);
      const centre = (g.minY + g.maxY) / 2;
      let target = inside.length ? inside.sort((a, b) => Math.abs(a.y - centre) - Math.abs(b.y - centre))[0] : null;
      if (!target) {
        const near = byDist(centre);
        const gap = Math.min(...labels.map((l) => Math.max(0, l.y - g.maxY, g.minY - l.y)));
        if (gap > 60 || /^question list$/i.test(text.trim())) continue; // page titles, headers
        target = near[0];
        if (['type', 'marks', 'answer'].includes(target.kind) && !shortFits(target.kind, text)) target = near.find((l) => ['question', 'option', 'explanation'].includes(l.kind)) || target;
      }
      g.rows.forEach((r) => target.lines.push(...r.parts));
    }
    labels.sort((a, b) => b.y - a.y);
    for (const l of labels) {
      // group pieces into visual lines (top to bottom, left to right)
      const rows = [];
      [...l.lines].sort((a, b) => b.y - a.y || a.x - b.x).forEach((it) => {
        const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
        if (row) row.parts.push(it); else rows.push({ y: it.y, parts: [it] });
      });
      const lines = rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((x) => x.str).join(' ').replace(/\s+/g, ' ').trim());
      cells.push({ label: l.str, text: l.kind === 'question' ? joinCellLines(lines) : lines.join(' '), status: l.status });
    }
  });
  return looksLikeTable(cells) ? cells : [];
}

// ---------- text extraction ----------

async function docxToText(buf) {
  const mammoth = (await import('mammoth/mammoth.browser.js')).default;
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const out = [];
  const cells = [];
  const textOf = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const walk = (el, depth) => {
    for (const node of el.children) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'ol' || tag === 'ul') walk(node, depth + 1);
      else if (tag === 'li') {
        const own = [...node.childNodes].filter((c) => !(c.nodeType === 1 && /^(ol|ul)$/i.test(c.tagName)));
        const t = own.map((c) => c.textContent).join(' ').replace(/\s+/g, ' ').trim();
        // typed numbering inside a list item ("1. ...") is parsed normally; otherwise mark it as an auto-numbered item
        out.push(LI + Math.max(0, depth - 1) + '|' + t);
        [...node.children].filter((c) => /^(ol|ul)$/i.test(c.tagName)).forEach((c) => walk(c, depth + 1));
      } else if (tag === 'table') {
        node.querySelectorAll('tr').forEach((tr) => {
          const tds = [...tr.children];
          const lab = tds[0] ? textOf(tds[0]) : '';
          if (labelOf(lab) && tds.length >= 2) {
            const paras = [...tds[1].querySelectorAll('p, li')].map(textOf).filter(Boolean);
            const text = paras.length ? joinCellLines(paras) : textOf(tds[1]);
            const status = tds.slice(2).map(textOf).find((t) => STATUS.test(t)) || '';
            cells.push({ label: lab, text, status });
          }
          out.push(tds.map(textOf).filter(Boolean).join(' '));
        });
      } else {
        // <br> inside a paragraph = a line break the author typed with Shift+Enter
        const parts = node.innerHTML.split(/<br\s*\/?>/i).map((h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' ').trim(); });
        out.push(...parts);
      }
    }
  };
  walk(doc.body.firstChild, 0);
  return { text: out.join('\n'), cells: looksLikeTable(cells) ? cells : [] };
}

async function pdfToText(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const lines = [];
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    pages.push(items.filter((it) => it.transform).map((it) => ({ x: it.transform[4], y: it.transform[5], str: it.str })));
    let line = '', lastY = null;
    for (const it of items) {
      const y = it.transform ? Math.round(it.transform[5]) : lastY;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line.trim()) { lines.push(line.trim()); line = ''; }
      line += it.str;
      lastY = y;
      if (it.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; }
    }
    if (line.trim()) lines.push(line.trim());
  }
  return { text: lines.join('\n').replace(/ {2,}/g, ' '), cells: pdfItemsToCells(pages) };
}

export const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const fileKind = (f) => (/\.csv$/i.test(f.name) || f.type === 'text/csv' ? 'csv'
  : /\.docx$/i.test(f.name) ? 'docx'
  : /\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? 'pdf'
  : /\.doc$/i.test(f.name) ? 'doc' : null);

// Mobile pickers may supply files without an extension or MIME type; detect the format from the first bytes.
export async function sniffKind(file) {
  const byName = fileKind(file);
  if (byName) return byName;
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const str = String.fromCharCode(...head);
  if (str.startsWith('%PDF')) return 'pdf';
  if (head[0] === 0x50 && head[1] === 0x4b) return 'docx'; // zip container
  if (head[0] === 0xd0 && head[1] === 0xcf) return 'doc';
  if (/^[\x09\x0a\x0d\x20-\x7e\xef\xbb\xbf]*$/.test(str) && /\.?(txt)?$/i.test(file.name) && /,/.test(await file.slice(0, 2000).text())) return 'csv';
  return null;
}

/** Read a .docx / .pdf and return { records, warnings, empty } */
export async function extractQuestions(file, kind) {
  const { text, cells } = await extractText(file, kind);
  if (!text.replace(/\s/g, '')) return { records: [], warnings: [], empty: true };
  return cells.length ? { ...recordsFromCells(cells), empty: false } : { ...parseQuestionText(text), empty: false };
}

export async function extractText(file, kind) {
  const buf = await file.arrayBuffer();
  kind = kind || fileKind(file);
  if (kind === 'docx') return docxToText(buf);
  if (kind === 'pdf') return pdfToText(buf);
  throw new Error('Unsupported file type.');
}
