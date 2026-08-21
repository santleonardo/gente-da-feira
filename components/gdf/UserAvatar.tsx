"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getInitials, getAvatarColor } from "@/lib/constants";

interface UserAvatarProps {
  user: {
    id: string;
    display_name: string;
    avatar_url?: string | null;
  };
  className?: string;
}

export function UserAvatar({ user, className }: UserAvatarProps) {
  const src = user.avatar_url || null;
  return (
    <Avatar className={className}>
      {src && <AvatarImage src={src} alt={user.display_name} />}
      <AvatarFallback className={`${getAvatarColor(user.id)} text-white`}>
        {getInitials(user.display_name)}
      </AvatarFallback>
    </Avatar>
  );
}
