import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/common/ProtectedRoute";

// Landing & Authentication
import Landing from "./pages/Landing";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import VerifyEmail from "./pages/auth/VerifyEmail";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";

// Teacher
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import CreateEvent from "./pages/teacher/CreateEvent";
import MyEvents from "./pages/teacher/MyEvents";
import TeacherEventDetails from "./pages/teacher/EventDetails";

// Dean
import DeanDashboard from "./pages/dean/DeanDashboard";
import DeanAllEvents from "./pages/dean/AllEvents";
import DeanEventDetails from "./pages/dean/EventDetails";
import DeanProfile from "./pages/dean/Profile";

// Super Admin
import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard";
import UserManagement from "./pages/superadmin/UserManagement";
import CreateDean from "./pages/superadmin/CreateDean";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>

          {/* ================= AUTH ================= */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* ================= TEACHER ================= */}
          <Route
            path="/teacher/dashboard"
            element={
              <ProtectedRoute allowedRoles={["teacher"]}>
                <TeacherDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/teacher/create-event"
            element={
              <ProtectedRoute allowedRoles={["teacher"]}>
                <CreateEvent />
              </ProtectedRoute>
            }
          />

          <Route
            path="/teacher/my-events"
            element={
              <ProtectedRoute allowedRoles={["teacher"]}>
                <MyEvents />
              </ProtectedRoute>
            }
          />

          <Route
            path="/teacher/events/:eventId"
            element={
              <ProtectedRoute allowedRoles={["teacher"]}>
                <TeacherEventDetails />
              </ProtectedRoute>
            }
          />

          {/* ================= DEAN ================= */}
          <Route
            path="/dean/dashboard"
            element={
              <ProtectedRoute allowedRoles={["dean"]}>
                <DeanDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dean/events"
            element={
              <ProtectedRoute allowedRoles={["dean"]}>
                <DeanAllEvents />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dean/events/:eventId"
            element={
              <ProtectedRoute allowedRoles={["dean"]}>
                <DeanEventDetails />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dean/profile"
            element={
              <ProtectedRoute allowedRoles={["dean"]}>
                <DeanProfile />
              </ProtectedRoute>
            }
          />

          {/* ================= SUPER ADMIN ================= */}
          <Route
            path="/superadmin/dashboard"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/superadmin/users"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <UserManagement />
              </ProtectedRoute>
            }
          />

          <Route
            path="/superadmin/create-dean"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <CreateDean />
              </ProtectedRoute>
            }
          />

          {/* Old /admin bookmarks from before the superadmin rename */}
          <Route path="/admin/*" element={<Navigate to="/superadmin/dashboard" replace />} />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;