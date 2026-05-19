'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Plus, Send, Eye, Trash2, Users } from 'lucide-react';
import {
  getAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  previewAnnouncementRecipients,
  sendAnnouncement,
  getClasses,
  type AnnouncementListItem,
  type AnnouncementDetail,
  type AnnouncementCategory,
  type AnnouncementAudience,
  type AnnouncementChannel,
} from '@/lib/api';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { usePermissions } from '@/hooks/use-permissions';
import { formatApiError } from '@/lib/api-errors';
import { cn } from '@/lib/utils';

const MODULE = 'announcements';

const CATEGORY_OPTIONS: { value: AnnouncementCategory; label: string }[] = [
  { value: 'trip', label: 'Trip / excursion' },
  { value: 'event', label: 'Event' },
  { value: 'holiday', label: 'Holiday / leave' },
  { value: 'academic', label: 'Academic' },
  { value: 'general', label: 'General' },
  { value: 'urgent', label: 'Urgent' },
];

const CHANNEL_OPTIONS = [
  { value: 'both', label: 'SMS + WhatsApp' },
  { value: 'sms', label: 'SMS only' },
  { value: 'whatsapp', label: 'WhatsApp only' },
];

const categoryBadge: Record<string, string> = {
  trip: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  event: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  holiday: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  academic: 'bg-teal-500/15 text-teal-300 ring-teal-500/30',
  general: 'bg-slate-500/20 text-slate-300 ring-white/10',
  urgent: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
};

type SchoolClass = { id: number; name: string };

const emptyForm = () => ({
  title: '',
  body: '',
  category: 'general' as AnnouncementCategory,
  audience_type: 'all_parents' as AnnouncementAudience,
  target_class_ids: [] as number[],
  channel: 'both' as AnnouncementChannel,
});

function parseList<T>(data: { results?: T[] } | T[]): T[] {
  return Array.isArray(data) ? data : data.results || [];
}

export default function AnnouncementsPage() {
  const { canCreate, canDelete, canAct } = usePermissions();
  const [list, setList] = useState<AnnouncementListItem[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AnnouncementDetail | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(() => {
    setLoading(true);
    getAnnouncements(statusFilter ? { status: statusFilter } : undefined)
      .then(({ data }) => setList(parseList(data)))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    loadList();
    getClasses()
      .then(({ data }) => setClasses(parseList(data)))
      .catch(() => setClasses([]));
  }, [loadList]);

  const refreshPreview = useCallback(
    (audience_type: AnnouncementAudience, target_class_ids: number[]) => {
      if (audience_type === 'classes' && !target_class_ids.length) {
        setRecipientCount(0);
        return;
      }
      setPreviewLoading(true);
      previewAnnouncementRecipients({ audience_type, target_class_ids })
        .then(({ data }) => setRecipientCount(data.recipient_count))
        .catch(() => setRecipientCount(null))
        .finally(() => setPreviewLoading(false));
    },
    []
  );

  useEffect(() => {
    if (!composeOpen) return;
    const t = window.setTimeout(() => {
      refreshPreview(form.audience_type, form.target_class_ids);
    }, 300);
    return () => window.clearTimeout(t);
  }, [composeOpen, form.audience_type, form.target_class_ids, refreshPreview]);

  const openCompose = (item?: AnnouncementListItem) => {
    setError(null);
    if (item && item.status === 'draft') {
      setEditingId(item.id);
      getAnnouncement(item.id)
        .then(({ data }) => {
          setForm({
            title: data.title,
            body: data.body,
            category: data.category,
            audience_type: data.audience_type,
            target_class_ids: data.target_class_ids || [],
            channel: data.channel,
          });
          setComposeOpen(true);
        })
        .catch((err) => alert(formatApiError(err)));
      return;
    }
    setEditingId(null);
    setForm(emptyForm());
    setRecipientCount(null);
    setComposeOpen(true);
  };

  const openDetail = (id: number) => {
    setDetail(null);
    setDetailOpen(true);
    getAnnouncement(id)
      .then(({ data }) => setDetail(data))
      .catch(() => setDetail(null));
  };

  const toggleClass = (classId: number) => {
    setForm((f) => {
      const has = f.target_class_ids.includes(classId);
      const target_class_ids = has
        ? f.target_class_ids.filter((id) => id !== classId)
        : [...f.target_class_ids, classId];
      return { ...f, target_class_ids, audience_type: 'classes' as AnnouncementAudience };
    });
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    body: form.body.trim(),
    category: form.category,
    audience_type: form.audience_type,
    target_class_ids: form.audience_type === 'classes' ? form.target_class_ids : [],
    channel: form.channel,
  });

  const handleSaveDraft = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setError('Title and message are required.');
      return;
    }
    if (form.audience_type === 'classes' && !form.target_class_ids.length) {
      setError('Select at least one class.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateAnnouncement(editingId, buildPayload());
      } else {
        await createAnnouncement(buildPayload());
      }
      setComposeOpen(false);
      loadList();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setError('Title and message are required.');
      return;
    }
    if (form.audience_type === 'classes' && !form.target_class_ids.length) {
      setError('Select at least one class.');
      return;
    }
    if (!recipientCount) {
      setError('No parents match this audience. Check class selection and student phones.');
      return;
    }
    if (!confirm(`Send this message to ${recipientCount} parent(s)?`)) return;

    setSending(true);
    setError(null);
    try {
      let id = editingId;
      if (id) {
        await updateAnnouncement(id, buildPayload());
      } else {
        const { data } = await createAnnouncement(buildPayload());
        id = data.id;
      }
      const { data: sendData } = await sendAnnouncement(id!);
      alert(sendData.message);
      setComposeOpen(false);
      loadList();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this draft announcement?')) return;
    try {
      await deleteAnnouncement(id);
      loadList();
    } catch (err) {
      alert(formatApiError(err));
    }
  };

  const formatWhen = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <PageShell>
      <PageHeader
        icon={Megaphone}
        eyebrow="Parent communication"
        title="Announcements"
        highlight=""
        subtitle="Broadcast trips, events, holidays, and updates to all parents or selected classes via SMS and WhatsApp."
        actions={
          canCreate(MODULE) ? (
            <Button
              onClick={() => openCompose()}
              className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25"
            >
              <Plus className="mr-2 h-4 w-4" />
              New announcement
            </Button>
          ) : undefined
        }
      />

      <GlassCard delay={0.05}>
        <motion.div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4">
          <DashboardSelect
            value={statusFilter}
            onChange={setStatusFilter}
            allowEmpty
            emptyLabel="All statuses"
            placeholder="All statuses"
            className={cn(dash.fieldSm, 'min-w-[140px]')}
            options={[
              { value: 'draft', label: 'Drafts' },
              { value: 'sent', label: 'Sent' },
            ]}
          />
        </motion.div>

        {loading ? (
          <InlineLoading message="Loading announcements…" />
        ) : list.length === 0 ? (
          <p className={dash.empty}>No announcements yet. Create one to notify parents.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={dash.th}>Title</th>
                  <th className={dash.th}>Category</th>
                  <th className={dash.th}>Audience</th>
                  <th className={dash.th}>Channel</th>
                  <th className={dash.th}>Status</th>
                  <th className={cn(dash.th, 'text-right')}>Recipients</th>
                  <th className={dash.th}>Sent</th>
                  <th className={cn(dash.th, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.id} className={dash.tr}>
                    <td className={cn(dash.td, 'font-medium text-slate-200')}>{row.title}</td>
                    <td className={dash.td}>
                      <span className={cn(dash.badge, categoryBadge[row.category] || categoryBadge.general)}>
                        {row.category_display}
                      </span>
                    </td>
                    <td className={cn(dash.td, 'max-w-[180px] truncate')} title={row.audience_label}>
                      {row.audience_label}
                    </td>
                    <td className={dash.td}>{row.channel_display}</td>
                    <td className={dash.td}>
                      <span
                        className={cn(
                          dash.badge,
                          row.status === 'sent' ? dash.badgeTeal : 'bg-slate-500/20 text-slate-400 ring-white/10'
                        )}
                      >
                        {row.status_display}
                      </span>
                    </td>
                    <td className={cn(dash.td, 'text-right tabular-nums')}>
                      {row.status === 'sent' ? row.recipient_count : '—'}
                    </td>
                    <td className={cn(dash.td, 'text-slate-400')}>{formatWhen(row.sent_at)}</td>
                    <td className={cn(dash.td, 'text-right')}>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => openDetail(row.id)} className={dash.link} title="View">
                          <Eye className="h-4 w-4" />
                        </button>
                        {row.status === 'draft' && canCreate(MODULE) && (
                          <button type="button" onClick={() => openCompose(row)} className={dash.link} title="Edit draft">
                            Edit
                          </button>
                        )}
                        {row.status === 'draft' && canDelete(MODULE) && (
                          <button
                            type="button"
                            onClick={() => handleDelete(row.id)}
                            className="text-rose-400 hover:text-rose-300"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {composeOpen && (
        <DashboardModal
          title={editingId ? 'Edit announcement' : 'New announcement'}
          subtitle="Notify parents by whole school or one/more classes."
          onClose={() => setComposeOpen(false)}
        >
          <div className="space-y-4">
            {error && <p className="text-sm text-rose-400">{error}</p>}

            <div>
              <label className={dash.label}>Category</label>
              <DashboardSelect
                value={form.category}
                onChange={(v) => setForm((f) => ({ ...f, category: v as AnnouncementCategory }))}
                options={CATEGORY_OPTIONS}
              />
            </div>

            <div>
              <label className={dash.label}>Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className={dash.field}
                placeholder="e.g. Class 6 picnic — 20 May"
              />
            </div>

            <div>
              <label className={dash.label}>Message</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                className={cn(dash.field, 'min-h-[120px]')}
                placeholder="Write the full message parents will receive…"
              />
            </div>

            <div>
              <label className={dash.label}>Audience</label>
              <div className="mb-3 flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input
                    type="radio"
                    checked={form.audience_type === 'all_parents'}
                    onChange={() => setForm((f) => ({ ...f, audience_type: 'all_parents', target_class_ids: [] }))}
                    className="accent-teal-500"
                  />
                  Whole school (all parents)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input
                    type="radio"
                    checked={form.audience_type === 'classes'}
                    onChange={() => setForm((f) => ({ ...f, audience_type: 'classes' }))}
                    className="accent-teal-500"
                  />
                  Selected class(es)
                </label>
              </div>

              {form.audience_type === 'classes' && (
                <div className={cn(dash.innerPanel, 'max-h-40 space-y-2 overflow-y-auto')}>
                  {classes.length === 0 ? (
                    <span className="text-sm text-slate-500">No classes found</span>
                  ) : (
                    classes.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                        <span className="text-slate-300">{c.name}</span>
                        <input
                          type="checkbox"
                          checked={form.target_class_ids.includes(c.id)}
                          onChange={() => toggleClass(c.id)}
                          className="rounded accent-teal-500"
                        />
                      </label>
                    ))
                  )}
                </div>
              )}

              <div className="mt-2 flex items-center gap-2 text-sm text-teal-300/90">
                <Users className="h-4 w-4 shrink-0" />
                {previewLoading ? (
                  <span className="text-slate-500">Counting parents…</span>
                ) : recipientCount != null ? (
                  <span>Will reach <strong>{recipientCount}</strong> parent phone(s)</span>
                ) : (
                  <span className="text-slate-500">Select audience to preview reach</span>
                )}
              </div>
            </div>

            <div>
              <label className={dash.label}>Channel</label>
              <DashboardSelect
                value={form.channel}
                onChange={(v) => setForm((f) => ({ ...f, channel: v as AnnouncementChannel }))}
                options={CHANNEL_OPTIONS}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {canCreate(MODULE) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={saving || sending}
                  className="rounded-xl border-white/10 bg-white/5"
                >
                  {saving ? 'Saving…' : 'Save draft'}
                </Button>
              )}
              {canAct(MODULE) && (
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={saving || sending || previewLoading}
                  className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {sending ? 'Sending…' : 'Send to parents'}
                </Button>
              )}
            </div>
          </div>
        </DashboardModal>
      )}

      {detailOpen && (
        <DashboardModal
          wide
          title={detail?.title || 'Announcement'}
          subtitle={detail ? `${detail.category_display} · ${detail.audience_label}` : ''}
          onClose={() => setDetailOpen(false)}
        >
          {!detail ? (
            <InlineLoading message="Loading…" />
          ) : (
            <div className="space-y-4 text-sm">
              <div className={cn(dash.innerPanel, 'whitespace-pre-wrap text-slate-300')}>{detail.body}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <span className="text-slate-500">Status:</span> {detail.status_display}
                </p>
                <p>
                  <span className="text-slate-500">Channel:</span> {detail.channel_display}
                </p>
                {detail.status === 'sent' && (
                  <>
                    <p>
                      <span className="text-slate-500">Recipients:</span> {detail.recipient_count}
                    </p>
                    <p>
                      <span className="text-slate-500">Sent:</span> {formatWhen(detail.sent_at)}
                    </p>
                    <p>
                      <span className="text-slate-500">SMS:</span> {detail.sent_sms}
                    </p>
                    <p>
                      <span className="text-slate-500">WhatsApp:</span> {detail.sent_whatsapp}
                    </p>
                    {detail.failed_count > 0 && (
                      <p className="text-rose-400">
                        <span className="text-slate-500">Failed deliveries:</span> {detail.failed_count}
                      </p>
                    )}
                  </>
                )}
              </div>
              {detail.target_class_names?.length > 0 && (
                <p className="text-slate-400">
                  Classes: {detail.target_class_names.join(', ')}
                </p>
              )}
            </div>
          )}
        </DashboardModal>
      )}
    </PageShell>
  );
}
