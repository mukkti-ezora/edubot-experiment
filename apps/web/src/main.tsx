import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/shell.css";

import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./lib/toast";
import { Shell } from "./components/Shell";
import { RoleShell } from "./components/RoleShell";
import { HomeRedirect, RequireAuth, RequireUserType } from "./components/RouteGuards";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { TeacherDashboard } from "./pages/TeacherDashboard";
import { ParentDashboard } from "./pages/ParentDashboard";
import { StudentFees } from "./pages/roles/StudentPages";
import { Today } from "./pages/student/Today";
import { Learn } from "./pages/student/Learn";
import { CourseView } from "./pages/student/CourseView";
import { LessonView } from "./pages/student/LessonView";
import { Doubts } from "./pages/student/Doubts";
import { DoubtView } from "./pages/student/DoubtView";
import { TopicView } from "./pages/student/TopicView";
import { DoubtsInbox } from "./pages/teacher/DoubtsInbox";
import { ClassDoubtView } from "./pages/teacher/ClassDoubtView";
import { TeacherClasses, TeacherMessages } from "./pages/roles/TeacherPages";
import { PracticeHub } from "./pages/student/practice/PracticeHub";
import { AssignmentView } from "./pages/student/practice/AssignmentView";
import { TestPlayer } from "./pages/student/practice/TestPlayer";
import { AttemptResult } from "./pages/student/practice/AttemptResult";
import { ReviewDeck } from "./pages/student/practice/ReviewDeck";
import { Progress } from "./pages/student/progress/Progress";
import { CourseGrades } from "./pages/student/progress/CourseGrades";
import { Mastery } from "./pages/student/progress/Mastery";
import { Credits } from "./pages/student/progress/Credits";
import { Schedule } from "./pages/student/schedule/Schedule";
import { Attendance } from "./pages/student/schedule/Attendance";
import { Leave } from "./pages/student/schedule/Leave";
import { OfflineLessons } from "./pages/student/OfflineLessons";
import { TeacherGradingPage } from "./pages/teacher/Grading";
import { TeacherRequests } from "./pages/teacher/Requests";
import { TeacherAttendancePage } from "./pages/teacher/AttendanceMarking";
import { TeacherTests } from "./pages/teacher/TestResults";
import { registerServiceWorker } from "./lib/offline";
import { ParentAcademics, ParentChildren, ParentFees, ParentMessages } from "./pages/roles/ParentPages";
import { Institutions } from "./pages/Institutions";
import { InstitutionDetail } from "./pages/InstitutionDetail";
import { Students } from "./pages/Students";
import { StudentDetail } from "./pages/StudentDetail";
import { Teachers } from "./pages/Teachers";
import { TeacherDetail } from "./pages/TeacherDetail";
import { Parents } from "./pages/Parents";
import { ParentDetail } from "./pages/ParentDetail";
import { Administrators } from "./pages/Administrators";
import { AdministratorDetail } from "./pages/AdministratorDetail";
import { Roles } from "./pages/Roles";
import { RoleDetail } from "./pages/RoleDetail";
import { Activity } from "./pages/Activity";
import { Sessions } from "./pages/Sessions";
import { SessionDetail } from "./pages/SessionDetail";
import { SettingsPage } from "./pages/Settings";
import { Profile } from "./pages/Profile";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route path="/home" element={<HomeRedirect />} />
        <Route element={<RequireUserType type="administrator" />}>
          <Route element={<Shell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/institutions" element={<Institutions />} />
            <Route path="/institutions/:id" element={<InstitutionDetail />} />
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/teachers" element={<Teachers />} />
            <Route path="/teachers/:id" element={<TeacherDetail />} />
            <Route path="/parents" element={<Parents />} />
            <Route path="/parents/:id" element={<ParentDetail />} />
            <Route path="/administrators" element={<Administrators />} />
            <Route path="/administrators/:id" element={<AdministratorDetail />} />
            <Route path="/roles" element={<Roles />} />
            <Route path="/roles/:id" element={<RoleDetail />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>
        <Route element={<RequireUserType type="student" />}>
          <Route element={<RoleShell role="student" />}>
            <Route path="/s" element={<Today />} />
            <Route path="/s/learn" element={<Learn />} />
            <Route path="/s/learn/:courseId" element={<CourseView />} />
            <Route path="/s/lessons/:lessonId" element={<LessonView />} />
            <Route path="/s/topics/:topicId" element={<TopicView />} />
            <Route path="/s/doubts" element={<Doubts />} />
            <Route path="/s/doubts/:doubtId" element={<DoubtView />} />
            <Route path="/s/offline" element={<OfflineLessons />} />
            <Route path="/s/practice" element={<PracticeHub />} />
            <Route path="/s/assignments" element={<Navigate to="/s/practice" replace />} />
            <Route path="/s/assignments/:assignmentId" element={<AssignmentView />} />
            <Route path="/s/attempts/:attemptId/take" element={<TestPlayer />} />
            <Route path="/s/attempts/:attemptId" element={<AttemptResult />} />
            <Route path="/s/review" element={<ReviewDeck />} />
            <Route path="/s/progress" element={<Progress />} />
            <Route path="/s/progress/courses/:courseId" element={<CourseGrades />} />
            <Route path="/s/progress/mastery" element={<Mastery />} />
            <Route path="/s/progress/credits" element={<Credits />} />
            <Route path="/s/grades" element={<Navigate to="/s/progress" replace />} />
            <Route path="/s/schedule" element={<Schedule />} />
            <Route path="/s/schedule/attendance" element={<Attendance />} />
            <Route path="/s/schedule/leave" element={<Leave />} />
            <Route path="/s/fees" element={<StudentFees />} />
          </Route>
        </Route>
        <Route element={<RequireUserType type="teacher" />}>
          <Route element={<RoleShell role="teacher" />}>
            <Route path="/t" element={<TeacherDashboard />} />
            <Route path="/t/doubts" element={<DoubtsInbox />} />
            <Route path="/t/doubts/:doubtId" element={<ClassDoubtView />} />
            <Route path="/t/classes" element={<TeacherClasses />} />
            <Route path="/t/attendance" element={<TeacherAttendancePage />} />
            <Route path="/t/grading" element={<TeacherGradingPage />} />
            <Route path="/t/requests" element={<TeacherRequests />} />
            <Route path="/t/tests" element={<TeacherTests />} />
            <Route path="/t/tests/:assessmentId" element={<TeacherTests />} />
            <Route path="/t/messages" element={<TeacherMessages />} />
          </Route>
        </Route>
        <Route element={<RequireUserType type="parent" />}>
          <Route element={<RoleShell role="parent" />}>
            <Route path="/p" element={<ParentDashboard />} />
            <Route path="/p/children" element={<ParentChildren />} />
            <Route path="/p/academics" element={<ParentAcademics />} />
            <Route path="/p/fees" element={<ParentFees />} />
            <Route path="/p/messages" element={<ParentMessages />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);