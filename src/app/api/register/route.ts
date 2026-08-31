import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fetchCharacterFromRaiderio, RaiderioLookupError } from "@/lib/raiderio";
import { findSpec } from "@/lib/wow-specs";
import {
  checkRegistrationAllowed,
  recordRegistrationAttempt,
} from "@/lib/registration-attempts";
import { clientIpFromHeaders, retryAfterLabel } from "@/lib/rate-limit";

// Formulář je verzovaný natvrdo v kódu pro danou sezónu - toto je
// zjednodušená verze pokrývající pole z aktuálního formuláře.
const registerSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8),
  email: z.string().email().optional(),
  discordNick: z.string().min(2),
  raiderioUrl: z.string().url(),
  specRole: z.enum(["TANK", "HEALER", "DPS"]),
  // Prázdné = použije se aktivní spec z Raider.io.
  wowSpec: z.string().optional(),
  seasonId: z.string(),
  formAnswers: z.record(z.any()),
});

export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders((name) => request.headers.get(name));

  // Limit se kontroluje jako první, ještě před rozborem těla - i vadný
  // požadavek stojí práci a hlavně by šel použít k obcházení limitu.
  const verdict = await checkRegistrationAllowed(ip);

  if (verdict.blocked) {
    return NextResponse.json(
      {
        error: `Příliš mnoho pokusů o registraci. Zkus to znovu ${retryAfterLabel(
          verdict.retryAfterSeconds
        )}.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(verdict.retryAfterSeconds) },
      }
    );
  }

  await recordRegistrationAttempt(ip);

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
    wowSpec,
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

  // Spec se ve formuláři vybírá jen podle role, takže do něj může přijít spec
  // jiné classy ("Frost" má Death Knight i Mage). Class z Raider.io je
  // závazná - nesedící kombinaci radši odmítneme, než aby ji shuffle později
  // vyhodnotil jako neznámý spec.
  if (wowSpec) {
    const spec = findSpec(raiderioData.class, wowSpec);

    if (!spec) {
      return NextResponse.json(
        {
          error: `Spec "${wowSpec}" neodpovídá class ${raiderioData.class}, kterou má postava na Raider.io.`,
        },
        { status: 400 }
      );
    }

    if (spec.role !== specRole) {
      return NextResponse.json(
        {
          error: `Spec "${wowSpec}" je ${spec.role}, ale registrace je na roli ${specRole}.`,
        },
        { status: 400 }
      );
    }
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
        // Ručně zvolený spec má přednost - hráč se může hlásit se specem,
        // se kterým ho Raider.io naposledy nevidělo (typicky tank/heal switch).
        wowSpec: wowSpec || raiderioData.wowSpec,
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
