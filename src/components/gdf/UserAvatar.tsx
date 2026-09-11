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
  /** Hero / acima da dobra — carrega com prioridade */
  priority?: boolean;
}

export function UserAvatar({ user, className, priority = false }: UserAvatarProps) {
  const src = user.avatar_url || null;
  const textSize =
    className
      ?.split(/\s+/)
      .find((c) => /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl)$/.test(c)) || "text-sm";

  return (
    <Avatar className={cn("h-10 w-10", className)}>
      {src && (
        <AvatarImage
          src={src}
          alt={user.display_name}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          {...({ fetchPriority: priority ? "high" : "low" } as React.ImgHTMLAttributes<HTMLImageElement>)}
        />
      )}
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
