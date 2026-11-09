import type { ReactNode } from 'react';
import { BarChart3, KanbanSquare, Zap } from 'lucide-react';
import { Logo } from '@/components/layout/Sidebar';

const POINTS = [
  { icon: KanbanSquare, text: 'Drag deals through your pipeline and convert wins into clients' },
  { icon: Zap, text: 'Real-time notifications when work is assigned or deals move' },
  { icon: BarChart3, text: 'Live revenue, pipeline and delivery metrics' },
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-8 mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-[hsl(243_45%_14%)] lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative max-w-md text-white">
          <p className="text-sm font-medium uppercase tracking-widest text-indigo-200">For small digital agencies</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight">
            Leads, clients and delivery in one calm workspace.
          </h2>
          <ul className="mt-10 space-y-5">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-indigo-100">
                <span className="mt-0.5 rounded-md bg-white/10 p-1.5">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
