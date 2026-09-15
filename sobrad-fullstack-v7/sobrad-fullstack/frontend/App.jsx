import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { ToastProvider } from './ToastContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Breathing from './pages/Breathing.jsx';
import Journal from './pages/Journal.jsx';
import Chat from './pages/Chat.jsx';
import Mood from './pages/Mood.jsx';
import Progress from './pages/Progress.jsx';
import Study from './pages/Study.jsx';
import Emergency from './pages/Emergency.jsx';

function RootRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/home' : '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />

            <Route element={<RequireAuth />}>
              <Route path="/home" element={<Home />} />
              <Route path="/breathing" element={<Breathing />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/mood" element={<Mood />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/study" element={<Study />} />
              <Route path="/emergency" element={<Emergency />} />
            </Route>

            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
