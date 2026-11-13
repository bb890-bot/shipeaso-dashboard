import { NextRequest } from "next/server";
import { GET as getOrders } from "@/app/api/orders/route";

export type OrderPeriod = "today" | "yesterday" | "this-month";

const REPORTING_TIME_ZONE = "Asia/Kolkata";

function getDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getOrderPeriodRange(
  period: OrderPeriod,
  now = new Date()
): { startDate: string; endDate: string } {
  const today = getDateParts(now);
  const todayString = formatDate(today.year, today.month, today.day);

  if (period === "today") {
    return { startDate: todayString, endDate: todayString };
  }

  if (period === "this-month") {
    return {
      startDate: formatDate(today.year, today.month, 1),
      endDate: todayString,
    };
  }

  const previousDay = new Date(Date.UTC(today.year, today.month - 1, today.day - 1));
  const yesterday = formatDate(
    previousDay.getUTCFullYear(),
    previousDay.getUTCMonth() + 1,
    previousDay.getUTCDate()
  );
  return { startDate: yesterday, endDate: yesterday };
}

export function getOrdersForPeriod(request: NextRequest, period: OrderPeriod) {
  const url = new URL(request.url);
  const range = getOrderPeriodRange(period);
  url.searchParams.set("startDate", range.startDate);
  url.searchParams.set("endDate", range.endDate);
  if (!url.searchParams.has("refresh")) {
    url.searchParams.set("refresh", "latest");
  }

  return getOrders(
    new NextRequest(url, {
      method: request.method,
      headers: request.headers,
    })
  );
}
