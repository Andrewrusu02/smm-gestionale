import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between rise">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">{eyebrow}</p>}
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl" data-testid="page-title">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "indigo", testId, className }) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-600", emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600", amber: "bg-amber-50 text-amber-600", slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md rise", className)} data-testid={testId}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        {Icon && <span className={cn("rounded-lg p-2", tones[tone])}><Icon className="h-4 w-4" /></span>}
      </div>
      <p className="font-num mt-3 text-2xl font-bold tracking-tight text-slate-900" data-testid={testId && `${testId}-value`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Chip({ className, children, testId }) {
  return (
    <span data-testid={testId} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", className)}>
      {children}
    </span>
  );
}

export function Panel({ title, action, children, className, testId }) {
  return (
    <section className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-sm rise", className)} data-testid={testId}>
      {title && (
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function NativeSelect({ className, children, ...props }) {
  return (
    <select
      className={cn("h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({ label, children, hint, className }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function EmptyState({ icon: Icon, title, text, action, testId }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center" data-testid={testId}>
      {Icon && <Icon className="mb-3 h-8 w-8 text-slate-300" />}
      <p className="font-semibold text-slate-700">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-20" data-testid="loading">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
    </div>
  );
}

export function ConfirmDialog({ trigger, title, description, onConfirm, confirmLabel = "Elimina", testId }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid={testId && `${testId}-cancel`}>Annulla</AlertDialogCancel>
          <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={onConfirm} data-testid={testId && `${testId}-confirm`}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
