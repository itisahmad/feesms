'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardCheck, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import {
  getGradingSettings,
  updateGradingSettings,
  type GradingBand,
  type GradingSettingsPayload,
} from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { usePermissions } from '@/hooks/use-permissions';
import { formatApiError } from '@/lib/api-errors';
import { cn } from '@/lib/utils';

const emptyBand = (): GradingBand => ({ grade: '', min_percentage: 0 });

export default function GradingSettingsPage() {
  const { canEdit } = usePermissions();
  const canSave = canEdit('results');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [absentGrade, setAbsentGrade] = useState('AB');
  const [bands, setBands] = useState<GradingBand[]>([]);
  const [defaults, setDefaults] = useState<GradingBand[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getGradingSettings()
      .then(({ data }) => {
        setAbsentGrade(data.absent_grade || 'AB');
        setBands(data.bands?.length ? data.bands.map((b) => ({ ...b })) : []);
        setDefaults(data.default_bands || []);
      })
      .catch((err) => setError(formatApiError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const updateBand = (index: number, patch: Partial<GradingBand>) => {
    setBands((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const addBand = () => setBands((prev) => [...prev, emptyBand()]);

  const removeBand = (index: number) => {
    setBands((prev) => prev.filter((_, i) => i !== index));
  };

  const resetToDefaults = () => {
    if (!defaults.length) return;
    setBands(defaults.map((b) => ({ ...b })));
    setAbsentGrade('AB');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await updateGradingSettings({
        absent_grade: absentGrade.trim(),
        bands: bands.map((b) => ({
          grade: b.grade.trim(),
          min_percentage: Number(b.min_percentage),
        })),
        recalculate_draft: true,
      });
      setAbsentGrade(data.absent_grade);
      setBands(data.bands);
      const n = (data as { marks_recalculated?: number }).marks_recalculated;
      setSuccess(
        n != null && n > 0
          ? `Grading rules saved. Updated grades on ${n} mark entries in draft exams.`
          : 'Grading rules saved.',
      );
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <Link href="/dashboard/results" className={cn(dash.link, 'mb-4 inline-flex items-center gap-1')}>
        <ArrowLeft className="h-4 w-4" />
        Back to results
      </Link>

      <PageHeader
        icon={ClipboardCheck}
        title="Grading rules"
        subtitle="Define grade labels and minimum percentage for each band. Used when entering marks and on report cards."
      />

      {loading ? (
        <InlineLoading message="Loading grading rules…" />
      ) : (
        <GlassCard>
          <form onSubmit={handleSave} className="space-y-6">
            {error && <p className={dash.error}>{error}</p>}
            {success && <p className={dash.success}>{success}</p>}

            <div className="max-w-xs">
              <label className={dash.label}>Absent grade label</label>
              <input
                className={dash.field}
                value={absentGrade}
                onChange={(e) => setAbsentGrade(e.target.value)}
                placeholder="AB"
                maxLength={8}
                disabled={!canSave}
                required
              />
              <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
                Shown when a student is marked absent in a subject.
              </p>
            </div>

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className={dash.sectionTitle}>Grade bands</h3>
                {canSave && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetToDefaults}
                      className="gap-1 rounded-xl border-[var(--dash-glass-border)] bg-[var(--dash-hover)] text-[var(--dash-text-body)]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset defaults
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={addBand}
                      className="gap-1 rounded-xl border-0 bg-teal-500/20 text-teal-200 hover:bg-teal-500/30"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add band
                    </Button>
                  </div>
                )}
              </div>

              <p className="mb-3 text-sm text-[var(--dash-text-muted)]">
                List bands from highest to lowest minimum %. A student at or above the threshold gets that grade
                (e.g. 90% → A+).
              </p>

              <div className="overflow-x-auto rounded-xl border border-[var(--dash-glass-border)]">
                <table className={dash.table}>
                  <thead className={dash.thead}>
                    <tr>
                      <th className={dash.th}>Grade</th>
                      <th className={dash.th}>Min. percentage (%)</th>
                      {canSave && <th className={cn(dash.th, 'w-12')} />}
                    </tr>
                  </thead>
                  <tbody>
                    {bands.length === 0 ? (
                      <tr>
                        <td colSpan={canSave ? 3 : 2} className={cn(dash.td, dash.empty)}>
                          No bands — add one or reset to defaults.
                        </td>
                      </tr>
                    ) : (
                      bands.map((band, index) => (
                        <tr key={index} className={dash.tr}>
                          <td className={dash.td}>
                            <input
                              className={dash.fieldSm}
                              value={band.grade}
                              onChange={(e) => updateBand(index, { grade: e.target.value })}
                              placeholder="A+"
                              maxLength={8}
                              disabled={!canSave}
                              required
                            />
                          </td>
                          <td className={dash.td}>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              className={cn(dash.fieldSm, 'w-28')}
                              value={band.min_percentage}
                              onChange={(e) =>
                                updateBand(index, { min_percentage: Number(e.target.value) })
                              }
                              disabled={!canSave}
                              required
                            />
                          </td>
                          {canSave && (
                            <td className={dash.td}>
                              <button
                                type="button"
                                onClick={() => removeBand(index)}
                                className="rounded-lg p-2 text-red-400 hover:bg-red-500/10"
                                aria-label="Remove band"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {canSave && (
              <Button
                type="submit"
                disabled={saving || bands.length === 0}
                className="gap-2 rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save grading rules'}
              </Button>
            )}
          </form>
        </GlassCard>
      )}
    </PageShell>
  );
}
