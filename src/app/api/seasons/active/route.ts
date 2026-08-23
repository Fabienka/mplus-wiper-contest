import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const season = await prisma.season.findFirst({
    where: { status: "REGISTRATION_OPEN" },
    orderBy: { createdAt: "desc" },
  });

  if (!season) {
    return NextResponse.json(
      { error: "Aktuálně není otevřená žádná registrace." },
      { status: 404 }
    );
  }

  return NextResponse.json({ id: season.id, name: season.name });
}
