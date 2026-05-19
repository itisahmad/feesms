'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Plus, Trash2, Layers, IndianRupee, BookOpen, MessageCircle } from 'lucide-react';
import {
  getClasses,
  createClass,
  updateClass,
  deleteClass,
  addSection,
  addSubject,
  removeSubject,
  applyFeeToClass,
  getFeeStructures,
} from '@/lib/api';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
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

interface ClassSubject {
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
  subjects?: ClassSubject[];
  whatsapp_group_name?: string;
  whatsapp_group_link?: string;
  whatsapp_group_id?: string;
  created_at: string;
}

type WhatsappGroupForm = {
  whatsapp_group_name: string;
  whatsapp_group_link: string;
  whatsapp_group_id: string;
};

const emptyWhatsappForm = (): WhatsappGroupForm => ({
  whatsapp_group_name: '',
  whatsapp_group_link: '',
  whatsapp_group_id: '',
});

export default function ClassesPage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newSectionNames, setNewSectionNames] = useState('');
  const [addingSectionTo, setAddingSectionTo] = useState<number | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [addingSubjectTo, setAddingSubjectTo] = useState<number | null>(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [applyingFeeTo, setApplyingFeeTo] = useState<number | null>(null);
  const [applyFeeForm, setApplyFeeForm] = useState({ fee_structure_id: '', effective_from: '' });
  const [feeStructuresForClass, setFeeStructuresForClass] = useState<FeeStructure[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingWhatsappFor, setEditingWhatsappFor] = useState<number | null>(null);
  const [whatsappForm, setWhatsappForm] = useState<WhatsappGroupForm>(emptyWhatsappForm);

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
        ...(sectionNames.length > 0 ? { section_names: sectionNames } : {}),
      });
      setNewClassName('');
      setNewSectionNames('');
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

  const handleAddSubject = async (classId: number) => {
    if (!newSubjectName.trim()) return;
    setError('');
    setSaving(true);
    try {
      await addSubject(classId, newSubjectName.trim());
      setNewSubjectName('');
      setAddingSubjectTo(null);
      load();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr?.response?.data?.error || 'Failed to add subject');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSubject = async (classId: number, subjectId: number, subjectName: string) => {
    if (!confirm(`Remove subject "${subjectName}" from this class?`)) return;
    try {
      await removeSubject(classId, subjectId);
      load();
    } catch {
      alert('Failed to remove subject');
    }
  };

  const openWhatsappEdit = (c: SchoolClass) => {
    setEditingWhatsappFor(c.id);
    setWhatsappForm({
      whatsapp_group_name: c.whatsapp_group_name || '',
      whatsapp_group_link: c.whatsapp_group_link || '',
      whatsapp_group_id: c.whatsapp_group_id || '',
    });
    setError('');
  };

  const handleSaveWhatsapp = async (classId: number) => {
    setError('');
    setSaving(true);
    try {
      await updateClass(classId, {
        whatsapp_group_name: whatsappForm.whatsapp_group_name.trim(),
        whatsapp_group_link: whatsappForm.whatsapp_group_link.trim(),
        whatsapp_group_id: whatsappForm.whatsapp_group_id.trim(),
      });
      setEditingWhatsappFor(null);
      setWhatsappForm(emptyWhatsappForm());
      load();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: Record<string, string | string[]> } };
      const d = axErr?.response?.data;
      const first = d && Object.values(d)[0];
      setError(Array.isArray(first) ? first[0] : (first as string) || 'Failed to save WhatsApp group');
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
        title="Classes,"
        highlight="Sections & Subjects"
        subtitle="Create classes with optional sections and subjects. Optionally add a parents WhatsApp group per class — announcements can be posted there when you send updates."
        actions={
          <Button
            onClick={() => setShowForm(!showForm)}
            className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400"
          >
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? 'Cancel' : 'Add Class'}
          </Button>
        }
      />

      {showForm && (
        <GlassCard delay={0.05}>
          <motion.div className="border-b border-white/10 px-6 py-4">
            <h2 className={dash.sectionTitle}>Add new class</h2>
            <p className="mt-1 text-xs text-slate-500">
              Only the class name is required. Sections and subjects can be added later.
            </p>
          </motion.div>
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {error && <p className={dash.error}>{error}</p>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={dash.label}>Class name *</label>
                <input
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className={dash.field}
                  placeholder="e.g. Class 1, Nursery"
                  required
                />
              </div>
              <div>
                <label className={dash.label}>Sections (optional)</label>
                <input
                  value={newSectionNames}
                  onChange={(e) => setNewSectionNames(e.target.value)}
                  className={dash.field}
                  placeholder="e.g. A, B, C — leave blank to add later"
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500"
            >
              {saving ? 'Adding…' : 'Create class'}
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
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/20 ring-1 ring-teal-400/30">
                      <GraduationCap className="h-5 w-5 text-teal-300" />
                    </div>
                    <span className="text-lg font-semibold text-white">{c.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {applyingFeeTo === c.id ? (
                      <form onSubmit={handleApplyFee} className="flex flex-wrap items-center gap-2">
                        <DashboardSelect
                          value={applyFeeForm.fee_structure_id}
                          onChange={(v) => setApplyFeeForm((f) => ({ ...f, fee_structure_id: v }))}
                          allowEmpty
                          emptyLabel="Select fee type"
                          placeholder="Select fee type"
                          className={cn(dash.fieldSm, 'min-h-[38px] min-w-[200px] py-2')}
                          options={feeStructuresForClass.map((fs) => ({
                            value: String(fs.id),
                            label: `${fs.fee_type_name} — ₹${parseFloat(fs.amount).toLocaleString('en-IN')} (${fs.billing_period_display || fs.billing_period || 'Monthly'})`,
                          }))}
                        />
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
                        Apply fee
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
                    {addingSubjectTo === c.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={newSubjectName}
                          onChange={(e) => setNewSubjectName(e.target.value)}
                          placeholder="Subject name"
                          className={cn(dash.fieldSm, 'min-w-[140px]')}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddSubject(c.id)}
                        />
                        <button type="button" onClick={() => handleAddSubject(c.id)} disabled={saving} className={dash.link}>
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingSubjectTo(null);
                            setNewSubjectName('');
                          }}
                          className="text-sm text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingSubjectTo(c.id)}
                        className={cn(dash.link, 'inline-flex items-center gap-1')}
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        Add subject
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

                <div className="space-y-3 pl-[52px]">
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">Sections</p>
                    <div className="flex flex-wrap gap-2">
                      {c.sections?.map((s) => (
                        <span
                          key={s.id}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm font-medium text-slate-300"
                        >
                          {s.name}
                        </span>
                      ))}
                      {(!c.sections || c.sections.length === 0) && (
                        <span className="text-sm text-slate-500">None yet</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Parents WhatsApp group (optional)
                    </p>
                    {editingWhatsappFor === c.id ? (
                      <motion.div className="max-w-xl space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div>
                          <label className={dash.label}>Group label</label>
                          <input
                            value={whatsappForm.whatsapp_group_name}
                            onChange={(e) =>
                              setWhatsappForm((f) => ({ ...f, whatsapp_group_name: e.target.value }))
                            }
                            className={dash.fieldSm}
                            placeholder='e.g. "Class 5 Parents"'
                          />
                        </div>
                        <div>
                          <label className={dash.label}>Invite link</label>
                          <input
                            value={whatsappForm.whatsapp_group_link}
                            onChange={(e) =>
                              setWhatsappForm((f) => ({ ...f, whatsapp_group_link: e.target.value }))
                            }
                            className={dash.fieldSm}
                            placeholder="https://chat.whatsapp.com/..."
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Parents join manually. This link is included in announcement messages.
                          </p>
                        </div>
                        <div>
                          <label className={dash.label}>Group ID (optional, for auto-post)</label>
                          <input
                            value={whatsappForm.whatsapp_group_id}
                            onChange={(e) =>
                              setWhatsappForm((f) => ({ ...f, whatsapp_group_id: e.target.value }))
                            }
                            className={dash.fieldSm}
                            placeholder="120363...@g.us — Meta Cloud API only"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveWhatsapp(c.id)}
                            disabled={saving}
                            className={dash.link}
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingWhatsappFor(null);
                              setError('');
                            }}
                            className="text-sm text-slate-500"
                          >
                            Cancel
                          </button>
                        </div>
                        {error && <p className="text-xs text-rose-400">{error}</p>}
                      </motion.div>
                    ) : (
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {c.whatsapp_group_link ? (
                          <>
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200">
                              <MessageCircle className="h-3.5 w-3.5" />
                              {c.whatsapp_group_name || 'Parents group'}
                            </span>
                            <a
                              href={c.whatsapp_group_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={dash.link}
                            >
                              Open invite link
                            </a>
                          </>
                        ) : (
                          <span className="text-sm text-slate-500">
                            Not set — parents still receive direct SMS/WhatsApp
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openWhatsappEdit(c)}
                          className={cn(dash.link, 'inline-flex items-center gap-1')}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {c.whatsapp_group_link ? 'Edit group' : 'Add WhatsApp group'}
                        </button>
                      </div>
                    )}
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">Subjects taught</p>
                    <div className="flex flex-wrap gap-2">
                      {c.subjects?.map((sub) => (
                        <span
                          key={sub.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-sm font-medium text-violet-200"
                        >
                          {sub.name}
                          <button
                            type="button"
                            onClick={() => handleRemoveSubject(c.id, sub.id, sub.name)}
                            className="rounded p-0.5 text-violet-300/80 hover:bg-violet-500/20 hover:text-white"
                            aria-label={`Remove ${sub.name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      {(!c.subjects || c.subjects.length === 0) && (
                        <span className="text-sm text-slate-500">None yet — use Add subject</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </GlassCard>
    </PageShell>
  );
}
