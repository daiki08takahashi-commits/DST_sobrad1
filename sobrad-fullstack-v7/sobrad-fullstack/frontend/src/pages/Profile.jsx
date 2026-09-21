import { useEffect, useRef, useState } from 'react';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../ToastContext.jsx';
import { BreatheIcon, GoalIcon, JournalIcon } from '../components/icons.jsx';

// Profile: photo + username, and the grounding-minutes/journal-entries/
// goals-reached stats that used to live on Home (see Home.jsx -- moved here
// so Home stays just hero card + nav ring). Stats reuse the exact same
// .stats-row/.stat-chip markup Home used, fetched from the same, untouched
// GET /api/stats endpoint.
export default function Profile() {
  const { username, profilePhoto, applyUser } = useAuth();
  const showToast = useToast();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStatsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const initial = (username || '?').trim().charAt(0).toUpperCase() || '?';

  function handlePickPhoto() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    // Reset the input's value right away so choosing the same file again
    // later still fires a change event.
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const updatedUser = await api.uploadProfilePhoto(file);
      applyUser(updatedUser);
      showToast('Profile photo updated.');
    } catch (err) {
      showToast(err.message || "Couldn't upload that photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePhoto() {
    setRemoving(true);
    try {
      const updatedUser = await api.deleteProfilePhoto();
      applyUser(updatedUser);
      showToast('Profile photo removed.');
    } catch (err) {
      showToast(err.message || "Couldn't remove that photo. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Topbar title="Profile" />
      <div className="screen-inner">
        <section className="settings-section profile-photo-section">
          <div className="profile-photo-frame">
            {profilePhoto ? (
              <img className="profile-photo" src={profilePhoto} alt="" />
            ) : (
              <span className="profile-photo profile-photo-fallback" aria-hidden="true">
                {initial}
              </span>
            )}
          </div>
          <p className="profile-username">{username || 'Account'}</p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="visually-hidden-input"
            onChange={handleFileChange}
            aria-label="Upload profile photo"
          />
          <div className="profile-photo-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePickPhoto}
              disabled={uploading || removing}
            >
              {uploading ? 'Uploading…' : profilePhoto ? 'Change photo' : 'Upload photo'}
            </button>
            {profilePhoto && (
              <button
                type="button"
                className="btn-quiet"
                onClick={handleRemovePhoto}
                disabled={uploading || removing}
              >
                {removing ? 'Removing…' : 'Remove photo'}
              </button>
            )}
          </div>
        </section>

        <div className="stats-row">
          <div className="stat-chip">
            <span className="icon"><BreatheIcon /></span>
            <strong>{stats ? stats.grounding_minutes : statsError ? '—' : '…'}</strong>
            <span>grounding minutes</span>
          </div>
          <div className="stat-chip">
            <span className="icon"><JournalIcon /></span>
            <strong>{stats ? stats.journal_entries : statsError ? '—' : '…'}</strong>
            <span>journal entries</span>
          </div>
          <div className="stat-chip">
            <span className="icon"><GoalIcon /></span>
            <strong>{stats ? stats.goals_reached : statsError ? '—' : '…'}</strong>
            <span>goals reached</span>
          </div>
        </div>
      </div>
    </>
  );
}
