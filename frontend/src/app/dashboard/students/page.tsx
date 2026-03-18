'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStudents, createStudent, updateStudent, getClasses, getFeeStructures, getStudentFeeHistory } from '@/lib/api';

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
        parent_phone: form.parent_phone,
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
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Students</h1>
          <p className="text-gray-600 mt-1">Select class first, then section. Add classes & sections in the Classes section.</p>
        </div>
        <button
          onClick={() => {
            if (showForm) handleCancelEdit();
            else {
              setEditingId(null);
              setForm(getInitialStudentForm());
              setShowForm(true);
            }
          }}
          className="px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 transition"
        >
          {showForm ? 'Cancel' : '+ Add Student'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit student' : 'Add new student'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {error && <div className="md:col-span-2 p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>}
            {classes.length === 0 && (
              <div className="md:col-span-2 p-3 rounded bg-amber-50 text-amber-800 text-sm">
                No classes yet. Add classes with sections in the Classes section first.
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
              <select
                value={form.school_class}
                onChange={(e) => setForm((f) => ({ ...f, school_class: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                required
              >
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section *</label>
              <select
                value={form.section}
                onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                required
                disabled={!form.school_class || sectionsForClass.length === 0}
              >
                <option value="">Select section</option>
                {sectionsForClass.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {form.school_class && sectionsForClass.length === 0 && (
                <p className="text-amber-600 text-xs mt-1">Add sections to this class first</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admission date</label>
              <input
                type="date"
                value={form.admission_date}
                onChange={(e) => {
                  const d = e.target.value;
                  setForm((f) => ({
                    ...f,
                    admission_date: d,
                    charges_effective_from: d,
                    fee_structure_choices: f.fee_structure_choices.map((c) => ({ ...c, effective_from: d })),
                  }));
                }}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Charges apply from</label>
              <input
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
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-xs text-gray-500 mt-1">Defaults to admission date. Can be changed to a future date if charges start later.</p>
            </div>
            {feeStructures.length > 0 && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Fee types to charge (tick to apply)</label>
                <p className="text-xs text-gray-500 mb-2">Use &quot;Start from&quot; when a fee (library, exam, transport, etc.) begins mid-session — leave empty for from admission.</p>
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                  {feeStructures.map((fs) => (
                    <div key={fs.id} className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isFeeSelected(fs.id)}
                          onChange={() => toggleFeeStructure(fs.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">
                          {fs.fee_type_name} - ₹{parseFloat(fs.amount).toLocaleString('en-IN')}
                          {fs.billing_period_display ? ` (${fs.billing_period_display})` : ''}
                        </span>
                      </label>
                      {isFeeSelected(fs.id) && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Start from:</span>
                          <input
                            type="date"
                            value={getFeeEffectiveFrom(fs.id)}
                            onChange={(e) => setFeeEffectiveFrom(fs.id, e.target.value)}
                            className="text-sm px-2 py-1 rounded border border-gray-200"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent name *</label>
              <input
                value={form.parent_name}
                onChange={(e) => setForm((f) => ({ ...f, parent_name: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent phone *</label>
              <input
                value={form.parent_phone}
                onChange={(e) => setForm((f) => ({ ...f, parent_phone: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                placeholder="10-digit mobile"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent email</label>
              <input
                type="email"
                value={form.parent_email}
                onChange={(e) => setForm((f) => ({ ...f, parent_email: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admission no.</label>
              <input
                value={form.admission_number}
                readOnly
                disabled
                placeholder="Auto-generated on save"
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-xs text-gray-500 mt-1">Generated automatically by software.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roll no.</label>
              <input
                value={form.roll_number}
                onChange={(e) => setForm((f) => ({ ...f, roll_number: e.target.value }))}
                placeholder="Auto-generated (1,2,3...) if left blank"
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-xs text-gray-500 mt-1">Auto-generated class-section wise. Admin can edit; must be unique in class and section.</p>
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={saving || classes.length === 0} className="px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Saving...' : (editingId ? 'Update Student' : 'Add Student')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-200 w-64 focus:ring-2 focus:ring-teal-500"
        />
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
          disabled={!classFilter}
        >
          <option value="">All sections</option>
          {filterSections.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading...</div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No students yet. Add your first student above.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Name</th>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Class</th>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Parent</th>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Phone</th>
                <th className="text-right py-4 px-6 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-4 px-6">
                    <Link href={`/dashboard/students/${s.id}`} className="font-medium text-teal-600 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="py-4 px-6">{s.class_name}</td>
                  <td className="py-4 px-6">{s.parent_name}</td>
                  <td className="py-4 px-6">{s.parent_phone}</td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => handleEdit(s.id)}
                      className="text-sm text-teal-600 hover:underline font-medium"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
