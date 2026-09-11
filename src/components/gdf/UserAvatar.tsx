"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getInitials, getAvatarColor } from "@/lib/constants";
import { cn } from "@/lib/utils";

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
    <Avatar className={cn("h-10 w-10", className)}>
      {src && <AvatarImage src={src} alt={user.display_name} />}
      <AvatarFallback className={cn(`${getAvatarColor(user.id)} text-white font-medium`, className?.includes("text-") ? undefined : "text-sm")}>
        {getInitials(user.display_name)}
      </AvatarFallback>
    </Avatar>
  );
}
