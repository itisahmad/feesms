'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, Printer } from 'lucide-react';
import {
  generateReceiptPdf,
  getReceiptSettings,
  getReceiptTemplates,
  type ReceiptTemplateMeta,
} from '@/lib/api';
import { DashboardModal } from '@/components/dashboard/modal';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { Button } from '@/components/ui/button';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type ReceiptPrintModalProps = {
  studentId: number;
  studentName: string;
  month: number;
  year: number;
  hasPaidFees?: boolean;
  onClose: () => void;
};

export function ReceiptPrintModal({
  studentId,
  studentName,
  month,
  year,
  hasPaidFees = true,
  onClose,
}: ReceiptPrintModalProps) {
  const [templates, setTemplates] = useState<ReceiptTemplateMeta[]>([]);
  const [templateKey, setTemplateKey] = useState('classic');
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4');
  const [receiptType, setReceiptType] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const previewRequestRef = useRef(0);

  const selectedTemplate = templates.find((t) => t.key === templateKey);

  const printFormatOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    if (selectedTemplate?.supports_a4 !== false) opts.push({ value: 'a4', label: 'A4' });
    if (selectedTemplate?.supports_thermal) opts.push({ value: 'thermal', label: 'Thermal 80mm' });
    if (opts.length === 0) opts.push({ value: 'a4', label: 'A4' });
    return opts;
  }, [selectedTemplate]);

  const periodLabel =
    receiptType === 'monthly'
      ? `${MONTHS[month]} ${year}`
      : `Academic year (from ${MONTHS[month]} ${year})`;

  useEffect(() => {
    Promise.all([getReceiptTemplates(), getReceiptSettings().catch(() => null)])
      .then(([tplRes, settingsRes]) => {
        setTemplates(tplRes.data);
        if (settingsRes?.data) {
          setTemplateKey(settingsRes.data.template_key || 'classic');
          setPrintFormat(settingsRes.data.print_format || 'a4');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedTemplate) return;
    if (printFormat === 'thermal' && !selectedTemplate.supports_thermal) {
      setPrintFormat('a4');
    }
    if (printFormat === 'a4' && !selectedTemplate.supports_a4 && selectedTemplate.supports_thermal) {
      setPrintFormat('thermal');
    }
  }, [templateKey, selectedTemplate, printFormat]);

  const loadPreview = useCallback(async () => {
    const requestId = ++previewRequestRef.current;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const { data } = await generateReceiptPdf({
        student_id: studentId,
        receipt_type: receiptType,
        month,
        year,
        template_key: templateKey,
        print_format: printFormat,
      });
      if (requestId !== previewRequestRef.current) return;
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err: unknown) {
      if (requestId !== previewRequestRef.current) return;
      const ax = err as { response?: { data?: { error?: string } } };
      setPreviewError(ax?.response?.data?.error || 'Failed to load receipt preview');
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      if (requestId === previewRequestRef.current) {
        setPreviewLoading(false);
      }
    }
  }, [studentId, receiptType, month, year, templateKey, printFormat]);

  useEffect(() => {
    if (loading || !hasPaidFees) return;
    const timer = setTimeout(() => {
      loadPreview();
    }, 400);
    return () => clearTimeout(timer);
  }, [loading, hasPaidFees, loadPreview]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePrint = () => {
    if (!previewUrl) {
      void loadPreview();
      return;
    }
    setPrinting(true);
    try {
      const win = window.open(previewUrl, '_blank', 'width=900,height=700');
      if (win) {
        win.onload = () => setTimeout(() => win.print(), 500);
      } else {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = previewUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow?.print();
          setTimeout(() => document.body.removeChild(iframe), 1000);
        };
      }
    } finally {
      setPrinting(false);
    }
  };

  if (!hasPaidFees) {
    return (
      <DashboardModal title="Print receipt" onClose={onClose}>
        <p className={dash.empty}>No paid fees to print a receipt for yet.</p>
      </DashboardModal>
    );
  }

  return (
    <DashboardModal
      xl
      title={`Receipt — ${studentName}`}
      subtitle="Preview before printing. The PDF shows the receipt generated date and time."
      onClose={onClose}
    >
      {loading ? (
        <InlineLoading message="Loading templates…" />
      ) : (
        <motion.div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <label className={dash.label}>Receipt period</label>
                  <DashboardSelect
                    value={receiptType}
                    onChange={(v) => setReceiptType(v as 'monthly' | 'yearly')}
                    options={[
                      { value: 'monthly', label: `Monthly — ${MONTHS[month]} ${year}` },
                      { value: 'yearly', label: 'Yearly — full academic year' },
                    ]}
                  />
                  <p className="mt-1 text-xs text-slate-500">{periodLabel}</p>
                </div>
                <div>
                  <label className={dash.label}>Print format</label>
                  <DashboardSelect
                    value={printFormat}
                    onChange={(v) => setPrintFormat(v as 'a4' | 'thermal')}
                    options={printFormatOptions}
                  />
                </div>
              </div>

              <div>
                <label className={dash.label}>Template</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {templates.map((tpl) => {
                    const active = templateKey === tpl.key;
                    return (
                      <button
                        key={tpl.key}
                        type="button"
                        onClick={() => setTemplateKey(tpl.key)}
                        title={tpl.description}
                        className={cn(
                          'rounded-lg border px-2.5 py-1.5 text-left text-xs transition',
                          active
                            ? 'border-teal-400/50 bg-teal-500/15 text-teal-100 ring-1 ring-teal-400/30'
                            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20'
                        )}
                      >
                        <span className="font-medium">{tpl.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => loadPreview()}
                  disabled={previewLoading}
                  className="border-white/15 bg-white/5 text-slate-200"
                >
                  <Eye className="mr-1.5 h-4 w-4" />
                  Refresh preview
                </Button>
              </div>
            </div>

            <div className="relative min-h-[320px] overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
              {previewLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f1a]/70 backdrop-blur-sm">
                  <InlineLoading message="Generating preview…" />
                </div>
              )}
              {previewError && !previewLoading && (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-amber-400">{previewError}</p>
                  <Button type="button" size="sm" onClick={() => loadPreview()} className="bg-teal-600">
                    Try again
                  </Button>
                </div>
              )}
              {previewUrl && !previewError && (
                <iframe
                  title="Receipt preview"
                  src={`${previewUrl}#toolbar=0`}
                  className="h-[min(65vh,520px)] w-full bg-white"
                />
              )}
              {!previewUrl && !previewLoading && !previewError && (
                <p className={cn(dash.empty, 'flex min-h-[320px] items-center justify-center')}>
                  Preview will appear here.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-white/10 pt-3">
            <Button
              type="button"
              onClick={handlePrint}
              disabled={printing || previewLoading || !previewUrl}
              className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500"
            >
              <Printer className="mr-2 h-4 w-4" />
              {printing ? 'Opening print…' : 'Print receipt'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl border-white/10 bg-white/5 text-slate-300"
            >
              Close
            </Button>
          </div>
        </motion.div>
      )}
    </DashboardModal>
  );
}
