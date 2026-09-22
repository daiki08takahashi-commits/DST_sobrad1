import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';
import { FamilyIcon } from '../components/icons.jsx';

// What a PARENT sees: the list of students who've shared their study record
// with them. Read-only, and scoped to Study data only -- see
// FamilyChildView.jsx for the per-child screen this links to. A student's
// own side of family sharing (sending/revoking invites) lives in
// Settings.jsx instead, since this route is the parent-facing one.
export default function Family() {
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getFamilyChildren()
      .then((data) => {
        if (!cancelled) setChildren(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Topbar title="Family" />
      <div className="screen-inner">
        {loaded && children.length === 0 && (
          <p className="mood-empty">
            No shared study records yet. If someone invites you, it&rsquo;ll show up here.
          </p>
        )}

        {children.length > 0 && (
          <div className="family-child-list">
            {children.map((child) => (
              <button
                type="button"
                className="family-child-card"
                key={child.link_id}
                onClick={() => navigate(`/family/${child.child_user_id}`)}
              >
                <span className="family-child-icon">
                  <FamilyIcon />
                </span>
                <span className="family-child-name">{child.child_username}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
