import { cn, initials } from '@/lib/utils';

export function UserAvatar({
  name,
  color,
  className,
}: {
  name?: string;
  color?: string;
  className?: string;
}) {
  return (
    <span
      title={name}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-card',
        className,
      )}
      style={{ backgroundColor: color ?? '#64748b' }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  users,
  max = 3,
}: {
  users: { _id: string; name: string; avatarColor?: string }[];
  max?: number;
}) {
  const extra = users.length - max;
  return (
    <div className="flex -space-x-2">
      {users.slice(0, max).map((u) => (
        <UserAvatar key={u._id} name={u.name} color={u.avatarColor} className="h-7 w-7 text-[10px]" />
      ))}
      {extra > 0 && (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-card">
          +{extra}
        </span>
      )}
    </div>
  );
}
