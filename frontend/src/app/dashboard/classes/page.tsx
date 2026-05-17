'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Plus, Trash2, Layers, IndianRupee } from 'lucide-react';
import { getClasses, createClass, deleteClass, addSection, applyFeeToClass, getFeeStructures } from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

interface Section {
  id: number;
  name: string;
  display_order: number;
}

interface FeeStructure {
  id: number;
  fee_type_name: string;
  amount: string;
  billing_period?: string;
  billing_period_display?: string;
}

interface SchoolClass {
  id: number;
  name: string;
  display_order: number;
  sections: Section[];
  created_at: string;
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newSectionNames, setNewSectionNames] = useState('A');
  const [addingSectionTo, setAddingSectionTo] = useState<number | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [applyingFeeTo, setApplyingFeeTo] = useState<number | null>(null);
  const [applyFeeForm, setApplyFeeForm] = useState({ fee_structure_id: '', effective_from: '' });
  const [feeStructuresForClass, setFeeStructuresForClass] = useState<FeeStructure[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    getClasses()
      .then(({ data }) => setClasses(data.results || data))
      .catch(() => setClasses([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setError('');
    setSaving(true);
    try {
      const sectionNames = newSectionNames.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      await createClass({
        name: newClassName.trim(),
        display_order: classes.length,
        section_names: sectionNames.length ? sectionNames : ['A'],
      });
      setNewClassName('');
      setNewSectionNames('A');
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: Record<string, string[]> } };
      const d = axErr?.response?.data;
      if (d?.name) setError(Array.isArray(d.name) ? d.name[0] : d.name);
      else setError('Failed to add class');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSection = async (classId: number) => {
    if (!newSectionName.trim()) return;
    setError('');
    setSaving(true);
    try {
      await addSection(classId, newSectionName.trim());
      setNewSectionName('');
      setAddingSectionTo(null);
      load();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr?.response?.data?.error || 'Failed to add section');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete class "${name}"? Students in this class will need to be reassigned.`)) return;
    try {
      await deleteClass(id);
      load();
    } catch {
      alert('Cannot delete - class may have students or fee structure');
    }
  };

  const openApplyFee = (classId: number) => {
    setApplyingFeeTo(classId);
    setApplyFeeForm({ fee_structure_id: '', effective_from: '' });
    getFeeStructures(classId)
      .then(({ data }) => setFeeStructuresForClass(data.results || data))
      .catch(() => setFeeStructuresForClass([]));
  };

  const handleApplyFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyingFeeTo || !applyFeeForm.fee_structure_id) return;
    setError('');
    setSaving(true);
    try {
      await applyFeeToClass(applyingFeeTo, {
        fee_structure_id: parseInt(applyFeeForm.fee_structure_id),
        ...(applyFeeForm.effective_from && { effective_from: applyFeeForm.effective_from }),
      });
      setApplyingFeeTo(null);
      setApplyFeeForm({ fee_structure_id: '', effective_from: '' });
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr?.response?.data?.error || 'Failed to apply fee');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={GraduationCap}
        eyebrow="School structure"
        title="Classes &"
        highlight="Sections"
        subtitle='Add classes with sections (e.g. A, B, C), then add students. Use "Apply fee to class" to add a fee type to all students in a class at once.'
        actions={
          <Button
            onClick={() => setShowForm(!showForm)}
            className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400 border-0"
          >
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? 'Cancel' : 'Add Class'}
          </Button>
        }
      />

      {showForm && (
        <GlassCard delay={0.05}>
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className={dash.sectionTitle}>Add new class with sections</h2>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {error && <p className={dash.error}>{error}</p>}
            <motion.div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={dash.label}>Class name</label>
                <input
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className={dash.field}
                  placeholder="e.g. Class 1, Nursery"
                />
              </div>
              <div>
                <label className={dash.label}>Sections (comma-separated)</label>
                <input
                  value={newSectionNames}
                  onChange={(e) => setNewSectionNames(e.target.value)}
                  className={dash.field}
                  placeholder="e.g. A, B, C"
                />
              </div>
            </motion.div>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0"
            >
              {saving ? 'Adding…' : 'Add Class'}
            </Button>
          </form>
        </GlassCard>
      )}

      <GlassCard delay={0.1}>
        {loading ? (
          <InlineLoading />
        ) : classes.length === 0 ? (
          <p className={dash.empty}>No classes yet. Add your first class above to get started.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {classes.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 + i * 0.04 }}
                className="group px-6 py-5 transition hover:bg-white/[0.03]"
              >
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <motion.div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/20 ring-1 ring-teal-400/30">
                      <GraduationCap className="h-5 w-5 text-teal-300" />
                    </div>
                    <span className="text-lg font-semibold text-white">{c.name}</span>
                  </motion.div>
                  <div className="flex flex-wrap items-center gap-2">
                    {applyingFeeTo === c.id ? (
                      <form onSubmit={handleApplyFee} className="flex flex-wrap items-center gap-2">
                        <select
                          value={applyFeeForm.fee_structure_id}
                          onChange={(e) => setApplyFeeForm((f) => ({ ...f, fee_structure_id: e.target.value }))}
                          className={dash.fieldSm}
                          required
                        >
                          <option value="">Select fee type</option>
                          {feeStructuresForClass.map((fs) => (
                            <option key={fs.id} value={fs.id}>
                              {fs.fee_type_name} - ₹{parseFloat(fs.amount).toLocaleString('en-IN')} (
                              {fs.billing_period_display || fs.billing_period || 'Monthly'})
                            </option>
                          ))}
                        </select>
                        {feeStructuresForClass.length === 0 && (
                          <span className="text-xs text-amber-400">Add fee structure for this class first</span>
                        )}
                        <input
                          type="date"
                          value={applyFeeForm.effective_from}
                          onChange={(e) => setApplyFeeForm((f) => ({ ...f, effective_from: e.target.value }))}
                          className={dash.fieldSm}
                        />
                        <button type="submit" disabled={saving} className={dash.link}>
                          {saving ? 'Applying…' : 'Apply to all'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setApplyingFeeTo(null);
                            setError('');
                          }}
                          className="text-sm text-slate-500 hover:text-slate-300"
                        >
                          Cancel
                        </button>
                        {error && <span className="text-xs text-red-400">{error}</span>}
                      </form>
                    ) : (
                      <button type="button" onClick={() => openApplyFee(c.id)} className={cn(dash.link, 'inline-flex items-center gap-1')}>
                        <IndianRupee className="h-3.5 w-3.5" />
                        Apply fee to class
                      </button>
                    )}
                    {addingSectionTo === c.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={newSectionName}
                          onChange={(e) => setNewSectionName(e.target.value)}
                          placeholder="Section name"
                          className={cn(dash.fieldSm, 'w-28')}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddSection(c.id)}
                        />
                        <button type="button" onClick={() => handleAddSection(c.id)} disabled={saving} className={dash.link}>
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingSectionTo(null);
                            setNewSectionName('');
                          }}
                          className="text-sm text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingSectionTo(c.id)}
                        className={cn(dash.link, 'inline-flex items-center gap-1')}
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Add section
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id, c.name)}
                      className={cn(dash.linkDanger, 'inline-flex items-center gap-1')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-[52px]">
                  {c.sections?.map((s) => (
                    <span
                      key={s.id}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm font-medium text-slate-300"
                    >
                      {s.name}
                    </span>
                  ))}
                  {(!c.sections || c.sections.length === 0) && (
                    <span className="text-sm text-slate-500">No sections</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </GlassCard>
    </PageShell>
  );
}
