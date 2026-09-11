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
  // Extrai tamanho de texto do className (ex.: text-3xl) para as iniciais
  const textSize =
    className
      ?.split(/\s+/)
      .find((c) => /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl)$/.test(c)) || "text-sm";

  return (
    <Avatar className={cn("h-10 w-10", className)}>
      {src && <AvatarImage src={src} alt={user.display_name} />}
      <AvatarFallback
        className={cn(
          getAvatarColor(user.id),
          "text-white font-medium",
          textSize
        )}
      >
        {getInitials(user.display_name)}
      </AvatarFallback>
    </Avatar>
  );
}
