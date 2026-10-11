import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const initialsOf = (name: string) =>
   name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('')

export const UserAvatar = ({ name, className }: { name: string; className?: string }) => (
   <Avatar className={className}>
      <AvatarFallback className="rounded-[inherit]">{initialsOf(name) || '?'}</AvatarFallback>
   </Avatar>
)
