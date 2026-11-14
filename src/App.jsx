import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout, { ToastProvider, ScrollToTop } from './components/Layout.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { Loading } from './components/States.jsx';
import Home from './pages/Home.jsx';
import Subjects from './pages/Subjects.jsx';
import Subject from './pages/Subject.jsx';
import Topic from './pages/Topic.jsx';
import { Exams, Exam } from './pages/Exams.jsx';
import { Sets, SetPage } from './pages/Sets.jsx';
import Play from './pages/Play.jsx';
import Search from './pages/Search.jsx';
import Login from './pages/Login.jsx';
import Progress from './pages/Progress.jsx';
import { StaticPage, NotFound } from './pages/Static.jsx';
import { MocksList, MockDetail } from './pages/Mocks.jsx';
import { PyqList, PyqDetail } from './pages/Pyq.jsx';
import CoursePage from './pages/Course.jsx';

const MockAttempt = lazy(() => import('./pages/MockExam.jsx').then((m) => ({ default: m.MockAttempt })));
const MockResult = lazy(() => import('./pages/MockExam.jsx').then((m) => ({ default: m.MockResult })));
const MyMockTests = lazy(() => import('./pages/MyMocks.jsx').then((m) => ({ default: m.MyMockTests })));
const MyPerformance = lazy(() => import('./pages/MyMocks.jsx').then((m) => ({ default: m.MyPerformance })));
const MockReport = lazy(() => import('./pages/MyMocks.jsx').then((m) => ({ default: m.MockReport })));
const MyAnalysisReport = lazy(() => import('./pages/MyMocks.jsx').then((m) => ({ default: m.MyAnalysisReport })));
const CoursesAdmin = lazy(() => import('./admin/Mocks.jsx').then((m) => ({ default: m.CoursesAdmin })));
const MocksAdmin = lazy(() => import('./admin/Mocks.jsx').then((m) => ({ default: m.MocksAdmin })));
const MockForm = lazy(() => import('./admin/Mocks.jsx').then((m) => ({ default: m.MockForm })));
const MockAttemptsAdmin = lazy(() => import('./admin/Mocks.jsx').then((m) => ({ default: m.MockAttemptsAdmin })));

// Admin code is split into its own chunk so students never download it.
const AdminLayout = lazy(() => import('./admin/common.jsx').then((m) => ({ default: m.AdminLayout })));
const Dashboard = lazy(() => import('./admin/Dashboard.jsx'));
const SubjectsAdmin = lazy(() => import('./admin/Catalog.jsx').then((m) => ({ default: m.SubjectsAdmin })));
const TopicsAdmin = lazy(() => import('./admin/Catalog.jsx').then((m) => ({ default: m.TopicsAdmin })));
const ExamsAdmin = lazy(() => import('./admin/Catalog.jsx').then((m) => ({ default: m.ExamsAdmin })));
const QuestionsAdmin = lazy(() => import('./admin/Questions.jsx').then((m) => ({ default: m.QuestionsAdmin })));
const QuestionForm = lazy(() => import('./admin/Questions.jsx').then((m) => ({ default: m.QuestionForm })));
const ImportCSV = lazy(() => import('./admin/Import.jsx'));
const SetsAdmin = lazy(() => import('./admin/Sets.jsx').then((m) => ({ default: m.SetsAdmin })));
const StudentsAdmin = lazy(() => import('./admin/Students.jsx'));
const VisitorsAdmin = lazy(() => import('./admin/Visitors.jsx'));
const PyqAdmin = lazy(() => import('./admin/Pyq.jsx').then((m) => ({ default: m.PyqAdmin })));
const PyqForm = lazy(() => import('./admin/Pyq.jsx').then((m) => ({ default: m.PyqForm })));
const SetForm = lazy(() => import('./admin/Sets.jsx').then((m) => ({ default: m.SetForm })));

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ScrollToTop />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="subjects" element={<Subjects />} />
              <Route path="subjects/:subject" element={<Subject />} />
              <Route path="subjects/:subject/:topic" element={<Topic />} />
              <Route path="exams" element={<Exams />} />
              <Route path="exams/:exam" element={<Exam />} />
              <Route path="practice" element={<Sets />} />
              <Route path="practice/:slug" element={<SetPage />} />
              <Route path="play" element={<Play />} />
              <Route path="search" element={<Search />} />
              <Route path="login" element={<Login />} />
              <Route path="progress" element={<Progress />} />
              <Route path="mock-tests" element={<MocksList />} />
              <Route path="mock-tests/:slug" element={<MockDetail />} />
              <Route path="courses/:slug" element={<CoursePage />} />
              <Route path="pyq" element={<PyqList />} />
              <Route path="pyq/:slug" element={<PyqDetail />} />
              <Route path="mock/attempt/:id" element={<MockAttempt />} />
              <Route path="mock/result/:id" element={<MockResult />} />
              <Route path="my/mock-tests" element={<MyMockTests />} />
              <Route path="my/performance" element={<MyPerformance />} />
              {['about', 'contact', 'privacy', 'terms', 'disclaimer'].map((p) => <Route key={p} path={p} element={<StaticPage page={p} />} />)}
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="my/report/:id" element={<MockReport />} />
            <Route path="my/analysis" element={<MyAnalysisReport />} />
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="subjects" element={<SubjectsAdmin />} />
              <Route path="topics" element={<TopicsAdmin />} />
              <Route path="exams" element={<ExamsAdmin />} />
              <Route path="questions" element={<QuestionsAdmin />} />
              <Route path="questions/new" element={<QuestionForm />} />
              <Route path="questions/:id" element={<QuestionForm />} />
              <Route path="import" element={<ImportCSV />} />
              <Route path="sets" element={<SetsAdmin />} />
              <Route path="sets/new" element={<SetForm />} />
              <Route path="sets/:id" element={<SetForm />} />
              <Route path="pyq" element={<PyqAdmin />} />
              <Route path="pyq/new" element={<PyqForm />} />
              <Route path="pyq/:id" element={<PyqForm />} />
              <Route path="students" element={<StudentsAdmin />} />
              <Route path="courses" element={<CoursesAdmin />} />
              <Route path="mocks" element={<MocksAdmin />} />
              <Route path="mocks/new" element={<MockForm />} />
              <Route path="mocks/:id" element={<MockForm />} />
              <Route path="mock-attempts" element={<MockAttemptsAdmin />} />
              <Route path="visitors" element={<VisitorsAdmin />} />
            </Route>
          </Routes>
        </Suspense>
      </ToastProvider>
    </AuthProvider>
  );
}
