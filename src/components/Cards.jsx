import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, Clock, ListChecks, TrainFront, ClipboardList, GraduationCap } from 'lucide-react';
import { SUBJECT_ICONS, tint } from './Icon.jsx';
import { BookOpen } from 'lucide-react';

// Pastel tile colours, rotated card by card: [background, icon colour].
const PASTEL = [['#fde2e4', '#e11d48'], ['#d9f2e6', '#15803d'], ['#dbeafe', '#2563eb'], ['#fef3c7', '#d97706'], ['#ede9fe', '#7c3aed'], ['#cffafe', '#0891b2'], ['#ffedd5', '#ea580c'], ['#e0e7ff', '#4338ca']];
function Tile({ Icon, tone, k }) {
  const [bg, fg] = tone == null ? tint(k) : PASTEL[tone % PASTEL.length];
  return <span className="icon-tile" style={{ background: bg, color: fg }} aria-hidden="true"><Icon size={22} strokeWidth={1.9} /></span>;
}
import { plural } from '../lib/text.js';

function Count({ n }) {
  return n
    ? <span className="sv-count">{plural(n, 'question')}</span>
    : <span className="sv-count soon">Coming soon</span>;
}

// Full-width list card: icon tile, title, one-line subtitle, count, chevron. Whole card is the link.
export function SubjectCard({ s, compact, tone, simple }) {
  return (
    <Link to={`/subjects/${s.slug}`} className={'card subject-card' + (compact ? ' compact' : '') + (simple ? ' simple' : '')}>
      <Tile Icon={SUBJECT_ICONS[s.icon] || BookOpen} tone={tone ?? (compact ? null : s.slug.length)} k={s.slug} />
      <span className="subject-card-body">
        <span className="subject-card-title">{s.name}</span>
        {!compact && s.description && <span className="subject-card-sub">{s.description}</span>}
        {!simple && <Count n={s.question_count} />}
      </span>
      {simple ? <ArrowRight className="arrow" size={20} aria-hidden="true" /> : <span className="chev" aria-hidden="true"><ChevronRight size={18} /></span>}
    </Link>
  );
}

// A course inside a category (e.g. BA Political Science under JMI). Opens its subjects, mocks and PYQs.
export function CourseCard({ k, tone, simple }) {
  const sub = k.description || (k.subjects?.length ? k.subjects.map((s) => s.name).join(' · ') : '');
  return (
    <Link to={`/courses/${k.slug}`} className={'card subject-card' + (simple ? ' simple' : '')}>
      <Tile Icon={GraduationCap} tone={tone ?? k.slug.length} k={k.slug} />
      <span className="subject-card-body">
        <span className="subject-card-title">{k.name}</span>
        {sub && <span className="subject-card-sub">{sub}</span>}
        {!simple && <Count n={k.question_count} />}
      </span>
      {simple ? <ArrowRight className="arrow" size={20} aria-hidden="true" /> : <span className="chev" aria-hidden="true"><ChevronRight size={18} /></span>}
    </Link>
  );
}

export function ExamCard({ e, tone, simple }) {
  const Icon = e.group_name === 'Railway' ? TrainFront : ClipboardList;
  return (
    <Link to={`/exams/${e.slug}`} className={'card subject-card exam-row' + (simple ? ' simple' : '')}>
      <Tile Icon={Icon} tone={tone ?? (e.group_name === 'Railway' ? 5 : 4)} k={e.slug} />
      <span className="subject-card-body">
        <span className="subject-card-title">{e.name} <span className="exam-tag">Exam</span></span>
        {e.description && <span className="subject-card-sub">{e.description}</span>}
        {!simple && <Count n={e.question_count} />}
      </span>
      {simple ? <ArrowRight className="arrow" size={20} aria-hidden="true" /> : <span className="chev" aria-hidden="true"><ChevronRight size={18} /></span>}
    </Link>
  );
}

export function SetCard({ p }) {
  return (
    <Link to={`/practice/${p.slug}`} className="card set-card">
      <span className="eyebrow">{p.exam?.name || p.subject?.name || 'Practice set'}</span>
      <span className="set-card-title">{p.title}</span>
      {p.description && <span className="muted small clamp-2">{p.description}</span>}
      <span className="set-meta">
        <span><ListChecks size={15} aria-hidden="true" /> {plural(p.question_count, 'question')}</span>
        <span><Clock size={15} aria-hidden="true" /> {p.time_limit_minutes ? `${p.time_limit_minutes} min` : 'Untimed'}</span>
        <ArrowRight size={15} className="set-go" aria-hidden="true" />
      </span>
    </Link>
  );
}

export function QuestionPreview({ q }) {
  const to = q.topic && q.subject ? `/subjects/${q.subject.slug}/${q.topic.slug}#q-${q.id}` : q.subject ? `/subjects/${q.subject.slug}` : '/subjects';
  return (
    <Link to={to} className="q-preview">
      <span className="eyebrow">{q.subject?.name}{q.topic ? ` · ${q.topic.name}` : ''}</span>
      <span className="clamp-2">{q.question}</span>
    </Link>
  );
}
