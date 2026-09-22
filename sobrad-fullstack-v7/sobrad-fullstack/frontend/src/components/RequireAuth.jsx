import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import * as api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { ChevronRightIcon } from './icons.jsx';
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

  // Whether the desktop sidebar is fully hidden (not just an icon rail --
  // gone entirely, freeing the full page width). A pure client-side
  // preference, persisted the same way the theme preference is (see
  // api.js's getSidebarCollapsed/setSidebarCollapsed). Mirrors the existing
  // body.focus-minimal precedent in index.css: toggling a class on <body>
  // is how this codebase already hides the sidebar (see .app-sidebar rules
  // there), so `sidebar-collapsed` follows that same mechanism.
  const [collapsed, setCollapsed] = useState(() => api.getSidebarCollapsed());

  useEffect(() => {
    api.setSidebarCollapsed(collapsed);
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    // Undo on unmount so a sign-out (which unmounts this route guard) never
    // leaves a stray class on <body> for the login screen underneath it.
    return () => document.body.classList.remove('sidebar-collapsed');
  }, [collapsed]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <>
      <div className="app-layout">
        <Sidebar collapsed={collapsed} onToggle={setCollapsed} />
        <div className="app-shell">
          <Outlet />
        </div>
      </div>
      {/* Always in the DOM (unlike .app-sidebar, which is display:none when
          collapsed) so it stays reachable -- CSS alone decides when it's
          actually visible (only body.sidebar-collapsed, and only >=900px,
          since there's no sidebar to restore below that width). A sibling
          of .app-layout/.pinned-layer, not nested inside .app-sidebar. */}
      <button
        type="button"
        className="sidebar-expand-btn"
        onClick={() => setCollapsed(false)}
        aria-label="Show sidebar"
        title="Show sidebar"
      >
        <ChevronRightIcon />
      </button>
      <div className="pinned-layer">
        <EmergencyFab />
      </div>
    </>
  );
}
