import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fetchCharacterFromRaiderio, RaiderioLookupError } from "@/lib/raiderio";

// Formulář je verzovaný natvrdo v kódu pro danou sezónu - toto je
// zjednodušená verze pokrývající pole z aktuálního formuláře.
const registerSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8),
  email: z.string().email().optional(),
  discordNick: z.string().min(2),
  raiderioUrl: z.string().url(),
  specRole: z.enum(["TANK", "HEALER", "DPS"]),
  seasonId: z.string(),
  formAnswers: z.record(z.any()),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Neplatná data formuláře", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    username,
    password,
    email,
    discordNick,
    raiderioUrl,
    specRole,
    seasonId,
    formAnswers,
  } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return NextResponse.json(
      { error: "Toto uživatelské jméno už je obsazené." },
      { status: 409 }
    );
  }

  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season || season.status !== "REGISTRATION_OPEN") {
    return NextResponse.json(
      { error: "Registrace do této sezóny není otevřená." },
      { status: 400 }
    );
  }

  let raiderioData;
  try {
    raiderioData = await fetchCharacterFromRaiderio(raiderioUrl);
  } catch (err) {
    if (err instanceof RaiderioLookupError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        passwordHash,
        email,
        discordNick,
      },
    });

    const character = await tx.character.create({
      data: {
        userId: user.id,
        raiderioUrl,
        characterName: raiderioData.characterName,
        realm: raiderioData.realm,
        faction: raiderioData.faction,
        guildName: raiderioData.guildName,
        class: raiderioData.class,
        specRole,
        rioScore: raiderioData.rioScore,
        lastSyncedAt: new Date(),
      },
    });

    const registration = await tx.seasonRegistration.create({
      data: {
        seasonId,
        characterId: character.id,
        formAnswers,
        raiderioSnapshot: raiderioData as unknown as object,
      },
    });

    return { user, character, registration };
  });

  // TODO: odeslat Discord webhook event "new_registration"

  return NextResponse.json(
    {
      message: "Registrace odeslána, čeká na schválení adminem.",
      registrationId: result.registration.id,
    },
    { status: 201 }
  );
}
