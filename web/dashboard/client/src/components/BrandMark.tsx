import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return <svg aria-hidden="true" className={cn('shrink-0', className)} viewBox="0 0 64 64" fill="none">
    <rect width="64" height="64" rx="14" fill="#081B32" />
    <circle cx="28" cy="28" r="17.5" stroke="#EEF6FF" strokeWidth="5" />
    <path d="M40.5 40.5 55 55" stroke="#EEF6FF" strokeLinecap="round" strokeWidth="5" />
    <rect x="19" y="31" width="5" height="9" rx="2" fill="#1E82FF" />
    <rect x="27" y="25" width="5" height="15" rx="2" fill="#1E82FF" />
    <rect x="35" y="18" width="5" height="22" rx="2" fill="#1E82FF" />
  </svg>;
}
