import { Link } from 'react-router-dom';
import { useMeta } from '../lib/hooks.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Empty } from '../components/States.jsx';

const PAGES = {
  about: ['About EntranceGo', 'EntranceGo is a free MCQ practice platform.', <>
    <p>EntranceGo helps students prepare for competitive exams, university courses and interviews by practising multiple-choice questions with clear explanations.</p>
    <p>Every question is written or reviewed by our editors, tagged by subject, topic, exam and difficulty, and can be practised in two ways: <strong>Practice mode</strong>, which shows feedback after each answer, and <strong>Test mode</strong>, which hides answers until you submit.</p>
    <p>EntranceGo is an independent project. It is not affiliated with the Staff Selection Commission, Railway Recruitment Boards or any other exam-conducting body.</p></>],
  contact: ['Contact', 'Contact the EntranceGo team.', <>
    <p>Found a mistake in a question, or want to suggest a topic? We'd like to hear from you.</p>
    <p>Email: <strong>hello@entrancego.in</strong> <span className="muted">(replace with your real contact address before launch)</span></p>
    <p>Please include the subject, topic and the question text when reporting an error, so we can fix it quickly.</p></>],
  privacy: ['Privacy Policy', 'How EntranceGo handles your data.', <>
    <p><strong>What we store.</strong> If you create an account, we store your email address, your practice results and your bookmarks. Visitors who don't sign in can practise without giving any personal data.</p>
    <p><strong>Where it is stored.</strong> Account and progress data is stored with our database provider (Supabase). Results are visible only to you; database rules prevent other users from reading them.</p>
    <p><strong>Cookies and local storage.</strong> We use your browser's storage to keep you signed in. We do not sell personal data or use advertising trackers.</p>
    <p><strong>Your choices.</strong> You can delete individual results from My Progress, or contact us to delete your account.</p>
    <p className="muted small">This is a starting template; review it with a qualified adviser before launch.</p></>],
  terms: ['Terms of Use', 'Terms for using EntranceGo.', <>
    <p>By using EntranceGo you agree to use it for personal learning. You may not copy the question bank in bulk, republish it, or attempt to access administrative features without authorisation.</p>
    <p>Content is provided "as is". We work hard to keep questions accurate but cannot guarantee that every answer is free from error.</p>
    <p>We may update these terms; continued use means you accept the current version.</p>
    <p className="muted small">This is a starting template; review it with a qualified adviser before launch.</p></>],
  disclaimer: ['Disclaimer', 'EntranceGo disclaimer.', <>
    <p>EntranceGo is an independent educational resource. Exam names such as SSC CGL or RRB NTPC are used only to describe the style of questions and do not imply any affiliation or endorsement.</p>
    <p>Questions are original practice material and are not official previous-year papers unless a source is explicitly stated. Always check official notifications for syllabus, dates and eligibility.</p></>],
};

export function StaticPage({ page }) {
  const [title, desc, body] = PAGES[page];
  useMeta(title, desc);
  return (
    <div className="container section narrow prose">
      <Breadcrumbs items={[{ label: title }]} />
      <h1>{title}</h1>
      {body}
    </div>
  );
}

export function NotFound() {
  useMeta('Page not found', undefined, { noindex: true });
  return (
    <div className="container section">
      <Empty title="Page not found" action={<Link className="btn btn-primary" to="/">Go to the homepage</Link>}>The page you're looking for doesn't exist or has moved.</Empty>
    </div>
  );
}
