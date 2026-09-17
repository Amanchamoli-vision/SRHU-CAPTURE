import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/common/ProtectedRoute";

// Authentication
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

// Teacher
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import CreateEvent from "./pages/teacher/CreateEvent";
import MyEvents from "./pages/teacher/MyEvents";
import TeacherEventDetails from "./pages/teacher/EventDetails";

// Dean
import DeanDashboard from "./pages/dean/DeanDashboard";
import DeanAllEvents from "./pages/dean/AllEvents";
import DeanEventDetails from "./pages/dean/EventDetails";

// Admin
import AdminDashboard from "./pages/admin/AdminDashboard";
import UserManagement from "./pages/admin/UserManagement";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>

          {/* ================= AUTH ================= */}
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

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

          {/* ================= ADMIN ================= */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <UserManagement />
              </ProtectedRoute>
            }
          />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;