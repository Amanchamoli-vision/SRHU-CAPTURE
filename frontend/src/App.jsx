import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/common/ProtectedRoute";

// Landing & Authentication
import Landing from "./pages/Landing";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import VerifyEmail from "./pages/auth/VerifyEmail";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import NotFound from "./pages/NotFound";

// Teacher
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import CreateEvent from "./pages/teacher/CreateEvent";
import MyEvents from "./pages/teacher/MyEvents";
import TeacherEventDetails from "./pages/teacher/EventDetails";

// Dean
import DeanDashboard from "./pages/dean/DeanDashboard";
import DeanAllEvents from "./pages/dean/AllEvents";
import DeanArchive from "./pages/dean/Archive";
import DeanEventDetails from "./pages/dean/EventDetails";
import DeanProfile from "./pages/dean/Profile";

// Super Admin
import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard";
import UserManagement from "./pages/superadmin/UserManagement";
import CreateDean from "./pages/superadmin/CreateDean";
import SuperAdminEvents from "./pages/superadmin/Events";
import SuperAdminEventDetails from "./pages/superadmin/EventDetails";
import SuperAdminUploadLimits from "./pages/superadmin/UploadLimits";

/**
 * The create-event wizard keeps a lot of state in refs (the server event id,
 * the local draft id, the step). Keying it by the query string remounts it
 * whenever the target changes -- e.g. "Create Event" in the sidebar while
 * editing an event -- so it can never PATCH or delete the previous record.
 */
function CreateEventRoute() {
  const location = useLocation();
  return <CreateEvent key={location.search} />;
}

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
                <CreateEventRoute />
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
            path="/dean/archive"
            element={
              <ProtectedRoute allowedRoles={["dean"]}>
                <DeanArchive />
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
            path="/superadmin/events"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <SuperAdminEvents />
              </ProtectedRoute>
            }
          />

          <Route
            path="/superadmin/events/:eventId"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <SuperAdminEventDetails />
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

          <Route
            path="/superadmin/upload-limits"
            element={
              <ProtectedRoute allowedRoles={["superadmin"]}>
                <SuperAdminUploadLimits />
              </ProtectedRoute>
            }
          />

          {/* Old /admin bookmarks from before the superadmin rename */}
          <Route path="/admin/*" element={<Navigate to="/superadmin/dashboard" replace />} />

          {/* Anything else: a real 404 page instead of a blank screen */}
          <Route path="*" element={<NotFound />} />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;