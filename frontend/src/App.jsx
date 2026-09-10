import { BrowserRouter, Routes, Route } from "react-router-dom";

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
      <Routes>

        {/* ================= AUTH ================= */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* ================= TEACHER ================= */}
        <Route
          path="/teacher/dashboard"
          element={<TeacherDashboard />}
        />

        <Route
          path="/teacher/create-event"
          element={<CreateEvent />}
        />

        <Route
          path="/teacher/my-events"
          element={<MyEvents />}
        />

        <Route
          path="/teacher/events/:eventId"
          element={<TeacherEventDetails />}
        />

        {/* ================= DEAN ================= */}
        <Route
          path="/dean/dashboard"
          element={<DeanDashboard />}
        />

        <Route
          path="/dean/events"
          element={<DeanAllEvents />}
        />

        <Route
          path="/dean/events/:eventId"
          element={<DeanEventDetails />}
        />

        {/* ================= ADMIN ================= */}
        <Route
          path="/admin/dashboard"
          element={<AdminDashboard />}
        />

        <Route
          path="/admin/users"
          element={<UserManagement />}
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;