'use client';

import { Pencil, Wallet } from 'lucide-react';
import { GlassCard } from '@/components/dashboard/page-shell';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import type { StudentFeeChoice } from './types';

type StudentFeesSectionProps = {
  feeChoices: StudentFeeChoice[];
  readOnly?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
};

export function StudentFeesSection({
  feeChoices,
  readOnly = false,
  canEdit = false,
  onEdit,
}: StudentFeesSectionProps) {
  return (
    <GlassCard delay={0.09}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-teal-400" />
          <h2 className="text-sm font-semibold text-white">Assigned fees</h2>
        </div>
        {!readOnly && canEdit && onEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="h-7 rounded-lg border-white/10 bg-white/5 px-2 text-[11px] text-slate-300"
          >
            <Pencil className="mr-1 h-3 w-3" />
            Edit
          </Button>
        ) : null}
      </div>
      <div className="p-4">
        {feeChoices.length === 0 ? (
          <p className="text-xs text-slate-500">
            {readOnly ? 'No fee types assigned.' : 'No fees assigned — click Edit to add.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {feeChoices.map((fc) => (
              <div
                key={fc.fee_structure_id}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <p className="text-xs font-medium text-slate-200">{fc.fee_type}</p>
                <p className="text-sm font-semibold text-teal-300">₹{fc.amount.toLocaleString('en-IN')}</p>
                {fc.effective_from ? (
                  <p className="text-[10px] text-slate-500">From {fc.effective_from}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
