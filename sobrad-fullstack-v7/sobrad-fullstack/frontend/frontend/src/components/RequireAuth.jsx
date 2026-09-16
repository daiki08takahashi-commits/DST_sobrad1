import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import EmergencyFab from './EmergencyFab.jsx';
import Sidebar from './Sidebar.jsx';

// Route guard: redirects to /login when there's no auth token, and otherwise
// renders the authenticated app shell (persistent sidebar + content + pinned
// emergency FAB). The sidebar (Sidebar.jsx) only shows itself from 900px up
// via CSS -- below that, .app-layout is just a plain wrapper around the
// unchanged mobile/tablet .app-shell, so nothing below the breakpoint
// changes.
export default function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <>
      <div className="app-layout">
        <Sidebar />
        <div className="app-shell">
          <Outlet />
        </div>
      </div>
      <div className="pinned-layer">
        <EmergencyFab />
      </div>
    </>
  );
}
