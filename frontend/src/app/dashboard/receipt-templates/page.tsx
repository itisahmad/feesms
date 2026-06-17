'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileStack, Eye, Save, Printer, Check, Upload, X } from 'lucide-react';
import {
  getReceiptSettings,
  getReceiptTemplates,
  previewReceiptPdf,
  updateReceiptSettings,
  type ReceiptSettingsPayload,
  type ReceiptTemplateMeta,
} from '@/lib/api';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { PageLoading, InlineLoading } from '@/components/dashboard/loading-state';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

const DEFAULT_SETTINGS: ReceiptSettingsPayload = {
  template_key: 'classic',
  print_format: 'a4',
  school_name: '',
  address: '',
  phone: '',
  email: '',
  header_color: '#0d9488',
  footer_text: 'This is a computer-generated receipt.',
  signature_label: 'Authorized Signatory',
  stamp_text: '',
  show_logo: true,
};

export default function ReceiptTemplatesPage() {
  const { canEdit } = usePermissions();
  const [templates, setTemplates] = useState<ReceiptTemplateMeta[]>([]);
  const [form, setForm] = useState<ReceiptSettingsPayload>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const selectedTemplate = templates.find((t) => t.key === form.template_key);

  const printFormatOptions = (() => {
    const opts: { value: string; label: string }[] = [];
    if (selectedTemplate?.supports_a4 !== false) opts.push({ value: 'a4', label: 'A4 (standard print)' });
    if (selectedTemplate?.supports_thermal) opts.push({ value: 'thermal', label: 'Thermal (80mm roll)' });
    if (opts.length === 0) opts.push({ value: 'a4', label: 'A4' });
    return opts;
  })();

  useEffect(() => {
    Promise.all([getReceiptTemplates(), getReceiptSettings()])
      .then(([tplRes, settingsRes]) => {
        setTemplates(tplRes.data);
        setForm({ ...DEFAULT_SETTINGS, ...settingsRes.data });
        setSignaturePreview(settingsRes.data.signature_image_url || null);
      })
      .catch(() => alert('Failed to load receipt settings'))
      .finally(() => setLoading(false));
  }, []);

  const refreshPreview = useCallback(async (payload: ReceiptSettingsPayload) => {
    setPreviewLoading(true);
    try {
      const { data } = await previewReceiptPdf(payload);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      /* preview is best-effort */
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      refreshPreview(form);
    }, 600);
    return () => clearTimeout(timer);
  }, [form, loading, refreshPreview]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!selectedTemplate) return;
    if (form.print_format === 'thermal' && !selectedTemplate.supports_thermal) {
      setForm((f) => ({ ...f, print_format: 'a4' }));
    }
    if (form.print_format === 'a4' && !selectedTemplate.supports_a4 && selectedTemplate.supports_thermal) {
      setForm((f) => ({ ...f, print_format: 'thermal' }));
    }
  }, [form.template_key, selectedTemplate, form.print_format]);

  const handleSave = async () => {
    if (!canEdit('receipt_templates')) return;
    setSaving(true);
    try {
      const { data } = await updateReceiptSettings(form);
      setForm({ ...form, ...data });
      setSignaturePreview(data.signature_image_url || null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      await refreshPreview({ ...form, ...data });
    } catch {
      alert('Failed to save receipt settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit('receipt_templates')) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, etc.).');
      return;
    }
    setUploadingSignature(true);
    try {
      const fd = new FormData();
      fd.append('signature_image', file);
      const { data } = await updateReceiptSettings(fd);
      setForm((f) => ({ ...f, ...data }));
      setSignaturePreview(data.signature_image_url || URL.createObjectURL(file));
      await refreshPreview({ ...form, ...data });
    } catch {
      alert('Failed to upload signature');
    } finally {
      setUploadingSignature(false);
      if (signatureInputRef.current) signatureInputRef.current.value = '';
    }
  };

  const handleRemoveSignature = async () => {
    if (!canEdit('receipt_templates')) return;
    if (!signaturePreview) return;
    setUploadingSignature(true);
    try {
      const { data } = await updateReceiptSettings({ clear_signature_image: true });
      setForm((f) => ({ ...f, ...data, signature_image_url: null }));
      setSignaturePreview(null);
      await refreshPreview({ ...form, ...data });
    } catch {
      alert('Failed to remove signature');
    } finally {
      setUploadingSignature(false);
    }
  };

  const openPrintPreview = () => {
    if (previewUrl) window.open(previewUrl, '_blank');
  };

  if (loading) return <PageLoading />;

  return (
    <PageShell>
      <PageHeader
        icon={FileStack}
        eyebrow="Branding & layout"
        title="Receipt"
        highlight="Templates"
        subtitle="Choose a professional template, customize your school branding, and preview receipts before printing or downloading PDFs."
        actions={
          canEdit('receipt_templates') ? (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500"
            >
              {saving ? (
                'Saving…'
              ) : savedFlash ? (
                <>
                  <Check className="mr-2 h-4 w-4" /> Saved
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> Save settings
                </>
              )}
            </Button>
          ) : undefined
        }
      />

      <GlassCard delay={0.05} className="mb-6">
        <motion.div className="border-b border-white/10 px-6 py-4">
          <h2 className={dash.sectionTitle}>Choose a template</h2>
          <p className="mt-1 text-sm text-slate-500">
            All templates are print-optimized. Pick one that fits your school — you can switch anytime.
          </p>
        </motion.div>
        <div className="flex flex-wrap gap-2 p-4">
          {templates.map((tpl) => {
            const active = form.template_key === tpl.key;
            return (
              <motion.button
                key={tpl.key}
                type="button"
                title={tpl.description}
                onClick={() => canEdit('receipt_templates') && setForm((f) => ({ ...f, template_key: tpl.key }))}
                disabled={!canEdit('receipt_templates')}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-sm transition',
                  active
                    ? 'border-teal-400/60 bg-teal-500/10 ring-1 ring-teal-400/40'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20',
                  !canEdit('receipt_templates') && 'cursor-default opacity-90'
                )}
              >
                <span className="font-medium text-white">{tpl.name}</span>
                <motion.div className="mt-1 flex gap-1">
                  {tpl.supports_a4 && (
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">A4</span>
                  )}
                  {tpl.supports_thermal && (
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">Thermal</span>
                  )}
                </motion.div>
              </motion.button>
            );
          })}
        </div>
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard delay={0.08}>
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className={dash.sectionTitle}>Branding & options</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload your school logo in Settings — it appears at the top of receipts instead of the school name.
              Override fields below only if needed.
            </p>
          </div>
          <div className="space-y-4 p-6">
            <div>
              <label className={dash.label}>Print format</label>
              <DashboardSelect
                value={form.print_format}
                onChange={(v) => setForm((f) => ({ ...f, print_format: v as 'a4' | 'thermal' }))}
                disabled={!canEdit('receipt_templates')}
                options={printFormatOptions}
              />
            </div>
            <motion.div>
              <label className={dash.label}>School name (override)</label>
              <input
                value={form.school_name}
                onChange={(e) => setForm((f) => ({ ...f, school_name: e.target.value }))}
                className={dash.field}
                placeholder="Uses school profile if empty"
                disabled={!canEdit('receipt_templates')}
              />
            </motion.div>
            <div>
              <label className={dash.label}>Address</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className={cn(dash.field, 'min-h-[72px] resize-y')}
                rows={2}
                disabled={!canEdit('receipt_templates')}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={dash.label}>Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className={dash.field}
                  disabled={!canEdit('receipt_templates')}
                />
              </div>
              <div>
                <label className={dash.label}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className={dash.field}
                  disabled={!canEdit('receipt_templates')}
                />
              </div>
            </div>
            <motion.div>
              <label className={dash.label}>Header accent color</label>
              <div className="flex gap-3">
                <input
                  type="color"
                  value={form.header_color}
                  onChange={(e) => setForm((f) => ({ ...f, header_color: e.target.value }))}
                  className="h-11 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                  disabled={!canEdit('receipt_templates')}
                />
                <input
                  value={form.header_color}
                  onChange={(e) => setForm((f) => ({ ...f, header_color: e.target.value }))}
                  className={cn(dash.field, 'flex-1 font-mono text-sm')}
                  disabled={!canEdit('receipt_templates')}
                />
              </div>
            </motion.div>
            <div>
              <label className={dash.label}>Footer text</label>
              <input
                value={form.footer_text}
                onChange={(e) => setForm((f) => ({ ...f, footer_text: e.target.value }))}
                className={dash.field}
                disabled={!canEdit('receipt_templates')}
              />
            </div>
            <div>
              <label className={dash.label}>Signature label</label>
              <input
                value={form.signature_label}
                onChange={(e) => setForm((f) => ({ ...f, signature_label: e.target.value }))}
                className={dash.field}
                disabled={!canEdit('receipt_templates')}
              />
            </div>
            <div>
              <label className={dash.label}>Signature image</label>
              <p className="mb-2 text-xs text-slate-500">
                Upload the school owner&apos;s signature — it appears on printed and downloaded receipts.
              </p>
              <input
                ref={signatureInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleSignatureUpload}
                disabled={!canEdit('receipt_templates') || uploadingSignature}
              />
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex h-20 min-w-[140px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3">
                  {signaturePreview ? (
                    <img src={signaturePreview} alt="Signature preview" className="max-h-16 max-w-[200px] object-contain" />
                  ) : (
                    <span className="text-xs text-slate-500">No signature uploaded</span>
                  )}
                </div>
                {canEdit('receipt_templates') && (
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={uploadingSignature}
                      onClick={() => signatureInputRef.current?.click()}
                      className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                    >
                      <Upload className="mr-1.5 h-4 w-4" />
                      {uploadingSignature ? 'Uploading…' : signaturePreview ? 'Change signature' : 'Upload signature'}
                    </Button>
                    {signaturePreview && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={uploadingSignature}
                        onClick={handleRemoveSignature}
                        className="border-white/15 bg-white/5 text-slate-400 hover:bg-white/10"
                      >
                        <X className="mr-1.5 h-4 w-4" />
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <motion.div>
              <label className={dash.label}>Stamp / seal text (optional)</label>
              <input
                value={form.stamp_text}
                onChange={(e) => setForm((f) => ({ ...f, stamp_text: e.target.value }))}
                className={dash.field}
                placeholder="e.g. School seal"
                disabled={!canEdit('receipt_templates')}
              />
            </motion.div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.show_logo}
                onChange={(e) => setForm((f) => ({ ...f, show_logo: e.target.checked }))}
                className="rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500/30"
                disabled={!canEdit('receipt_templates')}
              />
              <span className="text-sm text-slate-300">Show school logo on receipt</span>
            </label>

          </div>
        </GlassCard>

        <GlassCard delay={0.1}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
            <div>
              <h2 className={dash.sectionTitle}>Live preview</h2>
              <p className="mt-1 text-sm text-slate-500">Sample data — real receipts use actual payment details.</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refreshPreview(form)}
                disabled={previewLoading}
                className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
              >
                <Eye className="mr-1.5 h-4 w-4" />
                Refresh
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={openPrintPreview}
                disabled={!previewUrl}
                className="rounded-xl border-0 bg-teal-600 hover:bg-teal-500"
              >
                <Printer className="mr-1.5 h-4 w-4" />
                Open / Print
              </Button>
            </div>
          </div>
          <div className="relative min-h-[420px] p-4">
            {previewLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f1a]/60 backdrop-blur-sm">
                <InlineLoading message="Updating preview…" />
              </div>
            )}
            {previewUrl ? (
              <iframe
                title="Receipt preview"
                src={`${previewUrl}#toolbar=0`}
                className="h-[min(70vh,560px)] w-full rounded-xl border border-white/10 bg-white"
              />
            ) : (
              <p className={dash.empty}>Preview will appear here.</p>
            )}
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}
