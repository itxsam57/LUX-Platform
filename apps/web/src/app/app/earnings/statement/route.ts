import { NextRequest, NextResponse } from "next/server";
import { requireAdultViewer } from "@/lib/auth/context";
import { parseEarningsStatement, parseFinanceResourceId, parseStatementDate } from "@/lib/finance/policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function csv(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: NextRequest) {
  await requireAdultViewer("/app/earnings");
  const projectPublicId = parseFinanceResourceId("project", request.nextUrl.searchParams.get("project"));
  const from = parseStatementDate(request.nextUrl.searchParams.get("from"));
  const to = parseStatementDate(request.nextUrl.searchParams.get("to"));
  if (!projectPublicId || !from || !to) return NextResponse.json({ error: "invalid_statement" }, { status: 400 });
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const days = Math.floor((toDate.valueOf() - fromDate.valueOf()) / 86_400_000);
  if (days < 0 || days > 366) return NextResponse.json({ error: "invalid_statement_period" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_earnings_statement", {
    requested_project_public_id: projectPublicId,
    requested_from: from,
    requested_to: to,
  });
  const statement = parseEarningsStatement(data);
  if (error || !statement) return NextResponse.json({ error: "statement_unavailable" }, { status: 502 });

  const lines = [
    ["projectPublicId", "journalPublicId", "kind", "currency", "account", "side", "amountMinor", "occurredAt"],
    ...statement.entries.map((entry) => [statement.projectPublicId, entry.journalPublicId, entry.kind, entry.currency, entry.account, entry.side, entry.amountMinor, entry.occurredAt]),
  ];
  const body = lines.map((line) => line.map(csv).join(",")).join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="lux-earnings-${projectPublicId}-${from}-${to}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
