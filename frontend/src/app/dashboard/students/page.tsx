'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Users, Plus, Search, Info } from 'lucide-react';
import { getStudents, createStudent, updateStudent, getClasses, getFeeStructures, getStudentFeeHistory, getSchool } from '@/lib/api';
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

interface SchoolClass {
  id: number;
  name: string;
  display_order: number;
  sections: Section[];
}

interface FeeStructure {
  id: number;
  fee_type: number;
  fee_type_name: string;
  class_name: string;
  amount: string;
  billing_period?: string;
  billing_period_display?: string;
}

interface Student {
  id: number;
  name: string;
  class_name: string;
  school_class: number | null;
  section: number | null;
  section_name: string | null;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  admission_number: string;
  roll_number: string;
}

const getTodayDate = () => new Date().toISOString().slice(0, 10);

const getDefaultChargesEffectiveFrom = (admissionDate: string, feeStartDay: number) => {
  if (!admissionDate) return '';
  const d = new Date(admissionDate);
  if (Number.isNaN(d.getTime())) return admissionDate;

  if (d.getDate() <= feeStartDay) {
    return admissionDate;
  }

  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, Math.min(feeStartDay, 28));
  return nextMonth.toISOString().slice(0, 10);
};

const getInitialStudentForm = () => {
  const today = getTodayDate();
  return {
    name: '',
    school_class: '',
    section: '',
    admission_date: today,
    charges_effective_from: today,
    fee_structure_choices: [] as { fee_structure_id: number; effective_from: string }[],
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    admission_number: '',
    roll_number: '',
  };
};

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('');
  const [sectionFilter, setSectionFilter] = useState<string>('');
  const [form, setForm] = useState(getInitialStudentForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feeStartDay, setFeeStartDay] = useState(1);
  const [chargesHelpOpen, setChargesHelpOpen] = useState(false);

  const selectedClass = classes.find((c) => c.id === parseInt(form.school_class || '0'));
  const sectionsForClass = selectedClass?.sections || [];

  const loadStudents = () => {
    getStudents({
      search: search || undefined,
      class: classFilter ? parseInt(classFilter) : undefined,
      section: sectionFilter ? parseInt(sectionFilter) : undefined,
    })
      .then(({ data }) => setStudents(data.results || data))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getClasses()
      .then(({ data }) => setClasses(data.results || data))
      .catch(() => setClasses([]));

    getSchool()
      .then(({ data }) => {
        const list = data.results || data;
        const school = Array.isArray(list) ? list[0] : list;
        setFeeStartDay(school?.fee_start_day ?? 1);
        setForm((f) => {
          if (!f.admission_date) return f;
          const effectiveFrom = getDefaultChargesEffectiveFrom(f.admission_date, school?.fee_start_day ?? 1);
          return {
            ...f,
            charges_effective_from: effectiveFrom,
            fee_structure_choices: f.fee_structure_choices.map((c) => ({ ...c, effective_from: effectiveFrom })),
          };
        });
      })
      .catch(() => setFeeStartDay(1));
  }, []);

  useEffect(() => {
    loadStudents();
  }, [search, classFilter, sectionFilter]);

  const filterClass = classes.find((c) => c.id === parseInt(classFilter || '0'));
  const filterSections = filterClass?.sections || [];

  useEffect(() => {
    if (!classFilter) {
      setSectionFilter('');
    } else {
      const sc = classes.find((c) => c.id === parseInt(classFilter));
      const secs = sc?.sections || [];
      if (secs.length > 0) {
        setSectionFilter(secs[0].id.toString());
      } else {
        setSectionFilter('');
      }
    }
  }, [classFilter, classes]);

  useEffect(() => {
    const sc = classes.find((c) => c.id === parseInt(form.school_class || '0'));
    const secs = sc?.sections || [];
    if (form.school_class && secs.length > 0) {
      setForm((f) => ({ ...f, section: secs[0]?.id?.toString() || '' }));
    } else {
      setForm((f) => ({ ...f, section: '' }));
    }
  }, [form.school_class, classes]);

  useEffect(() => {
    if (form.school_class) {
      getFeeStructures(parseInt(form.school_class))
        .then(({ data }) => {
          const list = data.results || data;
          setFeeStructures(list);
          if (!editingId) {
            setForm((f) => ({
              ...f,
              fee_structure_choices: list.map((fs: FeeStructure) => ({
                fee_structure_id: fs.id,
                effective_from: f.charges_effective_from || '',
              })),
            }));
          }
        })
        .catch(() => setFeeStructures([]));
    } else {
      setFeeStructures([]);
      if (!editingId) setForm((f) => ({ ...f, fee_structure_choices: [] }));
    }
  }, [form.school_class, editingId]);

  const handleEdit = async (studentId: number) => {
    setEditingId(studentId);
    setShowForm(true);
    setError('');
    try {
      const { data } = await getStudentFeeHistory(studentId);
      const s = data.student;
      setForm({
        name: s.name,
        school_class: s.school_class?.toString() || '',
        section: s.section?.toString() || '',
        admission_date: s.admission_date?.slice(0, 10) || '',
        charges_effective_from: s.charges_effective_from?.slice(0, 10) || '',
        fee_structure_choices: (data.fee_choices || []).map((c: { fee_structure_id: number; effective_from: string | null }) => ({
          fee_structure_id: c.fee_structure_id,
          effective_from: c.effective_from?.slice(0, 10) || '',
        })),
        parent_name: s.parent_name || '',
        parent_phone: s.parent_phone || '',
        parent_email: s.parent_email || '',
        admission_number: s.admission_number || '',
        roll_number: s.roll_number || '',
      });
      if (s.school_class) {
        getFeeStructures(s.school_class)
          .then(({ data: fsData }) => setFeeStructures(fsData.results || fsData))
          .catch(() => setFeeStructures([]));
      }
    } catch {
      setError('Failed to load student');
      setEditingId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(getInitialStudentForm());
    setChargesHelpOpen(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.school_class) {
      setError('Please select a class');
      return;
    }
    if (!form.section) {
      setError('Please select a section');
      return;
    }
    const selectedChoices = form.fee_structure_choices.filter((c) => c.fee_structure_id);
    if (selectedChoices.length === 0) {
      setError('Please select at least one fee type');
      return;
    }
    const phoneDigits = form.parent_phone.replace(/\D/g, '');
    const normalizedPhone = phoneDigits.startsWith('91') && phoneDigits.length === 12
      ? phoneDigits.slice(2)
      : phoneDigits;
    if (normalizedPhone.length !== 10 || !/^[6-9]\d{9}$/.test(normalizedPhone)) {
      setError('Enter a valid 10-digit parent phone number');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        school_class: parseInt(form.school_class),
        section: parseInt(form.section),
        admission_date: form.admission_date || null,
        charges_effective_from: form.charges_effective_from || null,
        fee_structure_choices: form.fee_structure_choices
          .filter((c) => c.fee_structure_id)
          .map((c) => ({ fee_structure_id: c.fee_structure_id, ...(c.effective_from && { effective_from: c.effective_from }) })),
        parent_name: form.parent_name,
        parent_phone: normalizedPhone,
        parent_email: form.parent_email,
        admission_number: form.admission_number,
        roll_number: form.roll_number,
      };
      if (editingId) {
        await updateStudent(editingId, payload);
      } else {
        await createStudent(payload);
      }
      setForm(getInitialStudentForm());
      setShowForm(false);
      setEditingId(null);
      setChargesHelpOpen(false);
      loadStudents();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: Record<string, string[]> } };
      const d = axErr?.response?.data;
      setError(d && typeof d === 'object' ? Object.values(d).flat()[0] : (editingId ? 'Failed to update student' : 'Failed to add student'));
    } finally {
      setSaving(false);
    }
  };

  const toggleFeeStructure = (id: number) => {
    setForm((f) => {
      const exists = f.fee_structure_choices.some((c) => c.fee_structure_id === id);
      if (exists) {
        return { ...f, fee_structure_choices: f.fee_structure_choices.filter((c) => c.fee_structure_id !== id) };
      }
      return {
        ...f,
        fee_structure_choices: [
          ...f.fee_structure_choices,
          { fee_structure_id: id, effective_from: f.charges_effective_from || '' },
        ],
      };
    });
  };

  const setFeeEffectiveFrom = (id: number, date: string) => {
    setForm((f) => ({
      ...f,
      fee_structure_choices: f.fee_structure_choices.map((c) =>
        c.fee_structure_id === id ? { ...c, effective_from: date } : c
      ),
    }));
  };

  const isFeeSelected = (id: number) => form.fee_structure_choices.some((c) => c.fee_structure_id === id);
  const getFeeEffectiveFrom = (id: number) => form.fee_structure_choices.find((c) => c.fee_structure_id === id)?.effective_from || '';

  return (
    <PageShell>
      <PageHeader
        icon={Users}
        eyebrow="Roster"
        title="Students"
        subtitle="Select a class first, then a section. Add classes and sections under Classes before enrolling students."
        actions={
          <Button
            onClick={() => {
              if (showForm) handleCancelEdit();
              else {
                setEditingId(null);
                setForm(getInitialStudentForm());
                setShowForm(true);
              }
            }}
            className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400 border-0"
          >
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? 'Cancel' : 'Add Student'}
          </Button>
        }
      />

      {showForm && (
        <GlassCard delay={0.05}>
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className={dash.sectionTitle}>{editingId ? 'Edit student' : 'Add new student'}</h2>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            {error && <p className={cn(dash.error, 'md:col-span-2')}>{error}</p>}
            {classes.length === 0 && (
              <p className={cn(dash.warn, 'md:col-span-2')}>
                No classes yet. Add classes with sections in the Classes section first.
              </p>
            )}
            <div>
              <label className={dash.label}>Student name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={dash.field}
                required
              />
            </div>
            <div>
              <label className={dash.label}>Class *</label>
              <DashboardSelect
                value={form.school_class}
                onChange={(v) => setForm((f) => ({ ...f, school_class: v, section: '' }))}
                allowEmpty
                emptyLabel="Select class"
                placeholder="Select class"
                options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
              />
            </div>
            <div>
              <label className={dash.label}>Section *</label>
              <DashboardSelect
                value={form.section}
                onChange={(v) => setForm((f) => ({ ...f, section: v }))}
                allowEmpty
                emptyLabel="Select section"
                placeholder="Select section"
                disabled={!form.school_class || sectionsForClass.length === 0}
                options={sectionsForClass.map((s) => ({ value: String(s.id), label: s.name }))}
              />
              {form.school_class && sectionsForClass.length === 0 && (
                <p className="mt-1 text-xs text-amber-400">Add sections to this class first</p>
              )}
            </div>
            <div>
              <label className={dash.label}>Admission date</label>
              <input
                type="date"
                value={form.admission_date}
                onChange={(e) => {
                  const d = e.target.value;
                  const effectiveFrom = getDefaultChargesEffectiveFrom(d, feeStartDay);
                  setForm((f) => ({
                    ...f,
                    admission_date: d,
                    charges_effective_from: effectiveFrom,
                    fee_structure_choices: f.fee_structure_choices.map((c) => ({ ...c, effective_from: effectiveFrom })),
                  }));
                }}
                className={dash.field}
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <label htmlFor="charges_effective_from" className={cn(dash.label, 'mb-0')}>
                  Charges apply from
                </label>
                <button
                  type="button"
                  id="charges-apply-from-help-trigger"
                  onClick={() => setChargesHelpOpen((open) => !open)}
                  aria-label="How charges apply from works"
                  aria-expanded={chargesHelpOpen}
                  aria-controls="charges-apply-from-help"
                  className={cn(
                    'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition',
                    chargesHelpOpen
                      ? 'border-teal-400/50 bg-teal-500/20 text-teal-300'
                      : 'border-white/15 bg-white/5 text-slate-400 hover:border-teal-400/40 hover:bg-teal-500/10 hover:text-teal-300'
                  )}
                >
                  <Info className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <input
                id="charges_effective_from"
                type="date"
                value={form.charges_effective_from}
                onChange={(e) => {
                  const d = e.target.value;
                  setForm((f) => ({
                    ...f,
                    charges_effective_from: d,
                    fee_structure_choices: f.fee_structure_choices.map((c) => ({ ...c, effective_from: d })),
                  }));
                }}
                className={dash.field}
              />
              {chargesHelpOpen && (
                <div
                  id="charges-apply-from-help"
                  role="region"
                  aria-labelledby="charges-apply-from-help-trigger"
                  className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs leading-relaxed text-slate-400"
                >
                  <p>Think in months — the month on the date you pick is when billing starts.</p>
                  <ul className="list-disc space-y-1 pl-4">
                    <li>
                      Pick any date in <span className="text-slate-300">this month</span> → fees are calculated for{' '}
                      <span className="text-slate-300">this month</span>.
                    </li>
                    <li>
                      Want fees from <span className="text-slate-300">next month</span>? Pick any date in next month (e.g. 1 May if
                      the student joined in April).
                    </li>
                  </ul>
                </div>
              )}
            </div>
            {feeStructures.length > 0 && (
              <div className="md:col-span-2">
                <label className={dash.label}>Fee types to charge (tick to apply)</label>
                <p className="mb-2 text-xs text-slate-500">
                  Use &quot;Start from&quot; when a fee (library, exam, transport, etc.) begins mid-session — leave empty for from admission.
                </p>
                <div className={cn(dash.innerPanel, 'space-y-3')}>
                  {feeStructures.map((fs) => (
                    <div key={fs.id} className="flex flex-wrap items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isFeeSelected(fs.id)}
                          onChange={() => toggleFeeStructure(fs.id)}
                          className="rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500/30"
                        />
                        <span className="text-sm text-slate-300">
                          {fs.fee_type_name} - ₹{parseFloat(fs.amount).toLocaleString('en-IN')}
                          {fs.billing_period_display ? ` (${fs.billing_period_display})` : ''}
                        </span>
                      </label>
                      {isFeeSelected(fs.id) && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Start from:</span>
                          <input
                            type="date"
                            value={getFeeEffectiveFrom(fs.id)}
                            onChange={(e) => setFeeEffectiveFrom(fs.id, e.target.value)}
                            className={dash.fieldSm}
                            placeholder="From admission"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className={dash.label}>Parent name *</label>
              <input
                value={form.parent_name}
                onChange={(e) => setForm((f) => ({ ...f, parent_name: e.target.value }))}
                className={dash.field}
                required
              />
            </div>
            <div>
              <label className={dash.label}>Parent phone *</label>
              <input
                value={form.parent_phone}
                onChange={(e) => setForm((f) => ({ ...f, parent_phone: e.target.value }))}
                className={dash.field}
                placeholder="10-digit mobile"
                inputMode="numeric"
                maxLength={13}
                pattern="[0-9+ ]*"
                required
              />
              <p className="mt-1 text-xs text-slate-500">Enter a 10-digit mobile number, optionally with 91 prefix.</p>
            </div>
            <div>
              <label className={dash.label}>Parent email</label>
              <input
                type="email"
                value={form.parent_email}
                onChange={(e) => setForm((f) => ({ ...f, parent_email: e.target.value }))}
                className={dash.field}
              />
            </div>
            <div>
              <label className={dash.label}>Admission no.</label>
              <input
                value={form.admission_number}
                readOnly
                disabled
                placeholder="Auto-generated on save"
                className={dash.field}
              />
              <p className="mt-1 text-xs text-slate-500">Generated automatically by software.</p>
            </div>
            <div>
              <label className={dash.label}>Roll no.</label>
              <input
                value={form.roll_number}
                onChange={(e) => setForm((f) => ({ ...f, roll_number: e.target.value }))}
                placeholder="Auto-generated (1,2,3...) if left blank"
                className={dash.field}
              />
              <p className="mt-1 text-xs text-slate-500">Auto-generated class-section wise. Admin can edit; must be unique in class and section.</p>
            </div>
            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={saving || classes.length === 0}
                className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0"
              >
                {saving ? 'Saving…' : (editingId ? 'Update Student' : 'Add Student')}
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      <GlassCard delay={0.1}>
        <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(dash.field, 'pl-10')}
            />
          </div>
          <DashboardSelect
            value={classFilter}
            onChange={setClassFilter}
            allowEmpty
            emptyLabel="All classes"
            placeholder="All classes"
            className="w-full sm:w-48"
            options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
          />
          <DashboardSelect
            value={sectionFilter}
            onChange={setSectionFilter}
            allowEmpty
            emptyLabel="All sections"
            placeholder="All sections"
            className="w-full sm:w-48"
            disabled={!classFilter}
            options={filterSections.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        </div>

        {loading ? (
          <InlineLoading />
        ) : students.length === 0 ? (
          <p className={dash.empty}>No students yet. Add your first student above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={dash.table}>
              <thead className={dash.thead}>
                <tr>
                  <th className={dash.th}>Name</th>
                  <th className={dash.th}>Class</th>
                  <th className={dash.th}>Parent</th>
                  <th className={dash.th}>Phone</th>
                  <th className={cn(dash.th, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.12 + i * 0.04 }}
                    className={dash.tr}
                  >
                    <td className={cn(dash.td, 'font-medium')}>
                      <Link href={`/dashboard/students/${s.id}`} className={dash.link}>
                        {s.name}
                      </Link>
                    </td>
                    <td className={dash.td}>{s.class_name}</td>
                    <td className={dash.td}>{s.parent_name}</td>
                    <td className={dash.td}>{s.parent_phone}</td>
                    <td className={cn(dash.td, 'text-right')}>
                      <button type="button" onClick={() => handleEdit(s.id)} className={dash.link}>
                        Edit
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </PageShell>
  );
}
