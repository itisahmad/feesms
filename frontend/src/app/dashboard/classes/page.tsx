'use client';

import { useEffect, useState } from 'react';
import { getClasses, createClass, deleteClass, addSection, applyFeeToClass, getFeeStructures } from '@/lib/api';

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
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
        <h1 className="text-2xl font-bold text-gray-800">Classes & Sections</h1>
        <p className="text-gray-600 mt-1">Add classes with sections (e.g. A, B, C), then add students. Use &quot;Apply fee to class&quot; to add a fee type to all students in a class at once.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 transition"
        >
          {showForm ? 'Cancel' : '+ Add Class'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Add new class with sections</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Class name</label>
                <input
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g. Class 1, Nursery"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sections (comma-separated)</label>
                <input
                  value={newSectionNames}
                  onChange={(e) => setNewSectionNames(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g. A, B, C"
                />
              </div>
            </div>
            <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50">
              {saving ? 'Adding...' : 'Add Class'}
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading...</div>
        ) : classes.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No classes yet. Add your first class above to get started.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {classes.map((c) => (
              <div key={c.id} className="py-4 px-6 hover:bg-gray-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-800">{c.name}</span>
                  <div className="flex gap-2">
                    {applyingFeeTo === c.id ? (
                      <form onSubmit={handleApplyFee} className="flex flex-wrap gap-2 items-center">
                        <select
                          value={applyFeeForm.fee_structure_id}
                          onChange={(e) => setApplyFeeForm((f) => ({ ...f, fee_structure_id: e.target.value }))}
                          className="px-2 py-1 rounded border border-gray-200 text-sm"
                          required
                        >
                          <option value="">Select fee type</option>
                          {feeStructuresForClass.map((fs) => (
                            <option key={fs.id} value={fs.id}>
                              {fs.fee_type_name} - ₹{parseFloat(fs.amount).toLocaleString('en-IN')} ({fs.billing_period_display || fs.billing_period || 'Monthly'})
                            </option>
                          ))}
                        </select>
                        {feeStructuresForClass.length === 0 && (
                          <span className="text-xs text-amber-600">Add fee structure for this class first</span>
                        )}
                        <input
                          type="date"
                          value={applyFeeForm.effective_from}
                          onChange={(e) => setApplyFeeForm((f) => ({ ...f, effective_from: e.target.value }))}
                          placeholder="Start from (optional)"
                          className="px-2 py-1 rounded border border-gray-200 text-sm"
                        />
                        <button type="submit" disabled={saving} className="text-sm text-teal-600 hover:underline">
                          {saving ? 'Applying...' : 'Apply to all'}
                        </button>
                        <button type="button" onClick={() => { setApplyingFeeTo(null); setError(''); }} className="text-sm text-gray-500">
                          Cancel
                        </button>
                        {error && <span className="text-xs text-red-600">{error}</span>}
                      </form>
                    ) : (
                      <button
                        onClick={() => openApplyFee(c.id)}
                        className="text-sm text-teal-600 hover:underline"
                      >
                        Apply fee to class
                      </button>
                    )}
                    {addingSectionTo === c.id ? (
                      <div className="flex gap-2 items-center">
                        <input
                          value={newSectionName}
                          onChange={(e) => setNewSectionName(e.target.value)}
                          placeholder="Section name"
                          className="px-2 py-1 rounded border border-gray-200 text-sm w-24"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddSection(c.id)}
                        />
                        <button
                          onClick={() => handleAddSection(c.id)}
                          disabled={saving}
                          className="text-sm text-teal-600 hover:underline"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setAddingSectionTo(null); setNewSectionName(''); }}
                          className="text-sm text-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingSectionTo(c.id)}
                        className="text-sm text-teal-600 hover:underline"
                      >
                        + Add section
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(c.id, c.name)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.sections?.map((s) => (
                    <span key={s.id} className="px-2 py-1 rounded bg-gray-100 text-sm text-gray-700">
                      {s.name}
                    </span>
                  ))}
                  {(!c.sections || c.sections.length === 0) && (
                    <span className="text-sm text-gray-400">No sections</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
