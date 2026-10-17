import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { AdminOverviewPage } from "./pages/admin/AdminOverviewPage";
import { StudentHomePage } from "./pages/student/StudentHomePage";
import { AttemptPage } from "./pages/student/AttemptPage";
import { SetupNotice } from "./pages/SetupNotice";

export function App() {
  const { user, loading, seeded, sourceJson } = useAuth();

  if (loading) {
    return <div className="main">Загрузка…</div>;
  }

  if (!sourceJson || !seeded) {
    return <SetupNotice sourceJson={sourceJson} seeded={seeded} />;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : user.role === "admin" ? (
            <Navigate to="/admin" replace />
          ) : (
            <Navigate to="/student" replace />
          )
        }
      />
      <Route
        path="/admin"
        element={user?.role === "admin" ? <AdminOverviewPage user={user} /> : <Navigate to="/login" />}
      />
      <Route
        path="/student"
        element={user?.role === "student" ? <StudentHomePage user={user} /> : <Navigate to="/login" />}
      />
      <Route
        path="/student/attempts/:id"
        element={user?.role === "student" ? <AttemptPage /> : <Navigate to="/login" />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
