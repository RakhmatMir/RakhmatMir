import {
  classBundleFullySubmitted,
  loadPortalBundle,
} from "../static/js/portal-data.js";

function submissionMapFromStorage(localStorage) {
  try {
    const raw = localStorage.getItem("portal_site_submissions_v1");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function examProgress(bundle, examId, submissions, className) {
  const roster = (bundle.rosters || {})[className] || [];
  const classTotal = roster.length;
  let submittedCount = 0;
  for (const row of roster) {
    const key = `${examId}:${row.id}`;
    if (submissions[key]) submittedCount++;
  }
  return { submittedCount, classTotal };
}

/** Mirrors live server /api/portal/admin/sync-status shape. */
export async function buildAdminSyncStatus(localStorage) {
  const bundle = await loadPortalBundle({ fresh: true });
  const submissions = submissionMapFromStorage(localStorage);
  const primaryClass = bundle.classes?.[0]?.class_name || "6Б";
  const classes = {};

  for (const row of bundle.classes || []) {
    const cls = row.class_name;
    const finalized = classBundleFullySubmitted(bundle, cls, submissions);
    const exams = [];
    for (const ex of bundle.exams || []) {
      if (ex.class_name !== cls) continue;
      const { submittedCount, classTotal } = examProgress(bundle, ex.id, submissions, cls);
      exams.push({
        exam_id: ex.id,
        title: ex.title,
        submitted_count: submittedCount,
        class_total: classTotal || row.student_count || 0,
      });
    }
    classes[cls] = {
      finalized,
      finalized_at: finalized ? new Date().toISOString() : null,
      bundle_complete: finalized,
      class_total: row.student_count || 0,
      exams,
    };
  }

  const primaryFinalized = Boolean(classes[primaryClass]?.finalized);
  return {
    primary_class: primaryClass,
    finalized: primaryFinalized,
    classes,
  };
}
