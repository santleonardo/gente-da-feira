"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export interface CalendarProps {
  /** Data atualmente selecionada (ou null). */
  selected?: Date | null;
  /** Chamado quando o usuário clica em um dia habilitado. */
  onSelect: (date: Date) => void;
  /** Datas anteriores a esta ficam desabilitadas (padrão: hoje). */
  minDate?: Date | null;
  /** Mês inicialmente exibido (padrão: mês da data selecionada, ou hoje). */
  initialMonth?: Date;
  className?: string;
}

/**
 * Calendário mensal leve, sem dependências externas (sem react-day-picker).
 * Estilo consistente com o restante do app (tons neutros + acento laranja #D96C4A).
 */
export function Calendar({
  selected,
  onSelect,
  minDate,
  initialMonth,
  className,
}: CalendarProps) {
  const today = startOfDay(new Date());
  const floor = minDate === null ? null : startOfDay(minDate ?? today);

  const [viewDate, setViewDate] = useState(() => {
    const base = initialMonth ?? selected ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const goToPrevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div className={cn("w-full max-w-[280px] select-none rounded-xl border border-black/10 bg-white p-3 shadow-sm", className)}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#4A4A4A]/60 transition-colors hover:bg-[#F9F8F6]"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-[#4A4A4A]">
          {MONTH_LABELS[month]} {year}
        </span>
        <button
          type="button"
          onClick={goToNextMonth}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#4A4A4A]/60 transition-colors hover:bg-[#F9F8F6]"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((label, idx) => (
          <span key={idx} className="text-[10px] font-medium uppercase text-[#4A4A4A]/40">
            {label}
          </span>
        ))}

        {cells.map((date, idx) => {
          if (!date) return <span key={idx} />;

          const disabled = floor !== null && date < floor;
          const isSelected = selected ? isSameDay(date, selected) : false;
          const isToday = isSameDay(date, today);

          return (
            <button
              key={idx}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(date)}
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                disabled
                  ? "cursor-not-allowed text-[#4A4A4A]/20"
                  : "text-[#4A4A4A] hover:bg-[#D96C4A]/10",
                isSelected && !disabled && "bg-[#D96C4A] text-white hover:bg-[#D96C4A]",
                isToday && !isSelected && !disabled && "ring-1 ring-inset ring-[#D96C4A]/40"
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
