import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Topbar from '../components/Topbar.jsx';
import * as api from '../api.js';
import { StudySubjectBars, StudyTrendChart } from './Study.jsx';

// Passing-score threshold is a per-student setting (GET /api/study/settings)
// that isn't part of GET /api/family/{childId}/study's response, so there's
// no way to know the actual child's value from here. Falls back to the same
// 70% default the backend uses for a brand-new account (see Study.jsx's
// GradesTab) -- only affects where the charts' dashed reference line sits,
// never the averages/trends themselves, which the backend already computed
// against the child's real threshold.
const FALLBACK_THRESHOLD = 70;

// Read-only view of a linked child's Study record, for the parent. Deliberately
// shows only what GET /api/family/{childId}/study returns -- subject
// averages/trends and the AI trend summary -- and nothing from Journal,
// Mood, Chat, Focus, Emergency or Progress, which this endpoint never
// includes in the first place. Reuses Study.jsx's own chart components
// as-is (exported from there for this) so a shared child's chart looks
// identical to what they see themselves.
export default function FamilyChildView() {
  const { childId } = useParams();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setLoadError(false);
    api
      .getFamilyChildStudy(childId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  const subjectColorOrder = useMemo(
    () => [...new Set((data?.analysis?.subjects ?? []).map((s) => s.subject_name))].sort(),
    [data]
  );

  return (
    <>
      <Topbar title={data ? data.child_username : 'Family'} />
      <div className="screen-inner">
        {loadError && (
          <p className="mood-empty">Couldn&rsquo;t load this student&rsquo;s study record right now.</p>
        )}

        {!loadError && !data && <p className="mood-empty">…</p>}

        {data && (
          <>
            <h3 className="family-child-heading">{data.child_username}&rsquo;s study progress</h3>

            <div className="study-trend-section">
              <p className="eyebrow">Study progress</p>
              <p className="study-trend-summary">{data.insights.overall_summary}</p>
              {data.insights.series.length > 0 ? (
                <StudyTrendChart
                  series={data.insights.series}
                  threshold={FALLBACK_THRESHOLD}
                  subjectColorOrder={subjectColorOrder}
                />
              ) : (
                <p className="mood-empty">No grades logged yet.</p>
              )}
            </div>

            <div className="study-subject-bars-section">
              <p className="eyebrow">Subjects at a glance</p>
              {data.analysis.subjects.length > 0 ? (
                <StudySubjectBars
                  subjects={data.analysis.subjects}
                  threshold={FALLBACK_THRESHOLD}
                  subjectColorOrder={subjectColorOrder}
                />
              ) : (
                <p className="mood-empty">No subjects logged yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
