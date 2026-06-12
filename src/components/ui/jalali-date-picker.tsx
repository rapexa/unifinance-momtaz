import { useCallback, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  JALALI_MONTH_NAMES,
  JALALI_WEEKDAY_LABELS,
  addJalaliMonths,
  formatJalaliDisplay,
  formatJalaliParts,
  jalaliMonthLength,
  jalaliWeekday,
  parseJalaliParts,
  todayJalaliString,
} from "@/lib/jalaliDate";

export interface JalaliDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  clearable?: boolean;
}

function resolveViewMonth(value: string): { jy: number; jm: number } {
  const parsed = parseJalaliParts(value);
  if (parsed) return { jy: parsed.jy, jm: parsed.jm };
  const today = parseJalaliParts(todayJalaliString());
  return today ? { jy: today.jy, jm: today.jm } : { jy: 1403, jm: 1 };
}

export function JalaliDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
  disabled = false,
  className,
  id,
  clearable = true,
}: JalaliDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => resolveViewMonth(value));

  const selected = useMemo(() => parseJalaliParts(value), [value]);
  const todayParts = useMemo(() => parseJalaliParts(todayJalaliString()), [open]);
  const displayValue = useMemo(() => formatJalaliDisplay(value), [value]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        setView(resolveViewMonth(value));
      }
    },
    [value],
  );

  const cells = useMemo(() => {
    const daysInMonth = jalaliMonthLength(view.jy, view.jm);
    const firstWeekday = jalaliWeekday(view.jy, view.jm, 1);
    const grid: Array<{ day: number; inMonth: boolean }> = [];
    for (let i = 0; i < firstWeekday; i++) {
      grid.push({ day: 0, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push({ day: d, inMonth: true });
    }
    while (grid.length % 7 !== 0) {
      grid.push({ day: 0, inMonth: false });
    }
    return grid;
  }, [view.jy, view.jm]);

  const handleSelectDay = (day: number) => {
    onChange(formatJalaliParts({ jy: view.jy, jm: view.jm, jd: day }));
    setOpen(false);
  };

  const handleToday = () => {
    const today = todayJalaliString();
    onChange(today);
    const parsed = parseJalaliParts(today);
    if (parsed) setView({ jy: parsed.jy, jm: parsed.jm });
    setOpen(false);
  };

  return (
    <div className={cn("flex w-full gap-1", className)}>
      <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "flex-1 justify-between font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <span className="truncate" dir="ltr">
              {displayValue || placeholder}
            </span>
            <CalendarDays className="h-4 w-4 opacity-60 shrink-0 mr-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[300] w-[min(20rem,calc(100vw-1rem))] p-3"
          align="start"
          dir="rtl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between mb-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setView((v) => addJalaliMonths(v.jy, v.jm, -1))}
              aria-label="ماه قبل"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium">
              {JALALI_MONTH_NAMES[view.jm - 1]}{" "}
              {view.jy.toLocaleString("fa-IR")}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setView((v) => addJalaliMonths(v.jy, v.jm, 1))}
              aria-label="ماه بعد"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {JALALI_WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="text-center text-[0.7rem] text-muted-foreground py-1"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, idx) => {
              if (!cell.inMonth) {
                return <div key={`pad-${idx}`} className="h-9" />;
              }
              const isSelected =
                selected?.jy === view.jy &&
                selected?.jm === view.jm &&
                selected?.jd === cell.day;
              const isToday =
                todayParts?.jy === view.jy &&
                todayParts?.jm === view.jm &&
                todayParts?.jd === cell.day;

              return (
                <Button
                  key={`day-${view.jy}-${view.jm}-${cell.day}`}
                  type="button"
                  variant={isSelected ? "default" : "ghost"}
                  size="icon"
                  className={cn(
                    "h-9 w-9 p-0 text-sm",
                    isToday && !isSelected && "border border-primary/40",
                  )}
                  onClick={() => handleSelectDay(cell.day)}
                  aria-label={`${cell.day} ${JALALI_MONTH_NAMES[view.jm - 1]} ${view.jy}`}
                  aria-pressed={isSelected}
                >
                  {cell.day.toLocaleString("fa-IR")}
                </Button>
              );
            })}
          </div>

          <div className="mt-3 flex justify-center">
            <Button type="button" variant="secondary" size="sm" onClick={handleToday}>
              امروز
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {clearable && value && !disabled && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => onChange("")}
          aria-label="پاک کردن تاریخ"
        >
          <X className="h-4 w-4 opacity-60" />
        </Button>
      )}
    </div>
  );
}
