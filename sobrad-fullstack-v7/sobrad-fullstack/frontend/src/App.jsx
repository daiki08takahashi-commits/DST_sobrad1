import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { ToastProvider } from './ToastContext.jsx';
import { SettingsProvider } from './SettingsContext.jsx';
import { ThemeProvider } from './ThemeContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Breathing from './pages/Breathing.jsx';
import Journal from './pages/Journal.jsx';
import Chat from './pages/Chat.jsx';
import Mood from './pages/Mood.jsx';
import Progress from './pages/Progress.jsx';
import Study from './pages/Study.jsx';
import Insomnia from './pages/Insomnia.jsx';
import Emergency from './pages/Emergency.jsx';
import Focus from './pages/Focus.jsx';
import Settings from './pages/Settings.jsx';
import ScreenBreakReminder from './ScreenBreakReminder.jsx';

function RootRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/home' : '/login'} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <ToastProvider>
        <SettingsProvider>
        <BrowserRouter>
          <ScreenBreakReminder />
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
              <Route path="/insomnia" element={<Insomnia />} />
              <Route path="/emergency" element={<Emergency />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/focus" element={<Focus />} />
            </Route>

            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </BrowserRouter>
        </SettingsProvider>
      </ToastProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
