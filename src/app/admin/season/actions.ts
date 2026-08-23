"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma, SeasonStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, writeAuditLog } from "@/lib/admin";
import { parseTimeLimit } from "@/lib/labels";
import { RaiderioLookupError, fetchSeasonDungeons } from "@/lib/raiderio";

function revalidateSeason() {
  revalidatePath("/admin");
  revalidatePath("/admin/season");
}

export async function updateSeason(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("seasonId"));
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status")) as SeasonStatus;
  const raiderioSeasonSlug =
    String(formData.get("raiderioSeasonSlug") ?? "").trim() || null;

  if (!name) {
    throw new Error("Název sezóny nesmí být prázdný.");
  }

  const season = await prisma.season.findUniqueOrThrow({ where: { id } });

  // Časy otevření/uzavření registrace se odvozují od přechodu stavu,
  // ať je admin nemusí hlídat ručně.
  const data: Prisma.SeasonUpdateInput = { name, status, raiderioSeasonSlug };

  if (status === "REGISTRATION_OPEN" && !season.registrationOpenedAt) {
    data.registrationOpenedAt = new Date();
  }

  if (status === "REGISTRATION_CLOSED" && !season.registrationClosedAt) {
    data.registrationClosedAt = new Date();
  }

  await prisma.$transaction(async (tx) => {
    await tx.season.update({ where: { id }, data });

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "SEASON_UPDATED",
      entityType: "Season",
      entityId: id,
      oldValue: {
        name: season.name,
        status: season.status,
        raiderioSeasonSlug: season.raiderioSeasonSlug,
      },
      newValue: { name, status, raiderioSeasonSlug },
    });
  });

  revalidateSeason();
}

export async function updateDungeons(formData: FormData) {
  const admin = await requireAdmin();
  const ids = formData.getAll("dungeonId").map(String);

  const existing = await prisma.seasonDungeon.findMany({
    where: { id: { in: ids } },
  });

  await prisma.$transaction(async (tx) => {
    for (const dungeon of existing) {
      const next = {
        dungeonName: String(formData.get(`name-${dungeon.id}`) ?? "").trim(),
        abbreviation: String(formData.get(`abbr-${dungeon.id}`) ?? "")
          .trim()
          .toUpperCase(),
        timeLimitSeconds: parseTimeLimit(
          String(formData.get(`time-${dungeon.id}`) ?? "")
        ),
        coefficient: Number(formData.get(`coef-${dungeon.id}`)),
        isActive: formData.get(`active-${dungeon.id}`) === "on",
      };

      if (!next.dungeonName || !next.abbreviation) {
        throw new Error("Název i zkratka dungeonu jsou povinné.");
      }

      if (!Number.isFinite(next.coefficient) || next.coefficient <= 0) {
        throw new Error(
          `Koeficient u "${next.dungeonName}" musí být kladné číslo.`
        );
      }

      const unchanged =
        next.dungeonName === dungeon.dungeonName &&
        next.abbreviation === dungeon.abbreviation &&
        next.timeLimitSeconds === dungeon.timeLimitSeconds &&
        next.coefficient === dungeon.coefficient &&
        next.isActive === dungeon.isActive;

      if (unchanged) continue;

      await tx.seasonDungeon.update({ where: { id: dungeon.id }, data: next });

      await writeAuditLog(tx, {
        actorId: admin.id,
        actionType: "DUNGEON_UPDATED",
        entityType: "SeasonDungeon",
        entityId: dungeon.id,
        oldValue: {
          dungeonName: dungeon.dungeonName,
          abbreviation: dungeon.abbreviation,
          timeLimitSeconds: dungeon.timeLimitSeconds,
          coefficient: dungeon.coefficient,
          isActive: dungeon.isActive,
        },
        newValue: next,
      });
    }
  });

  revalidateSeason();
}

export async function addDungeon(formData: FormData) {
  const admin = await requireAdmin();
  const seasonId = String(formData.get("seasonId"));
  const dungeonName = String(formData.get("dungeonName") ?? "").trim();
  const abbreviation = String(formData.get("abbreviation") ?? "")
    .trim()
    .toUpperCase();

  if (!dungeonName || !abbreviation) {
    throw new Error("Název i zkratka dungeonu jsou povinné.");
  }

  await prisma.$transaction(async (tx) => {
    const dungeon = await tx.seasonDungeon.create({
      data: { seasonId, dungeonName, abbreviation, coefficient: 1 },
    });

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "DUNGEON_ADDED",
      entityType: "SeasonDungeon",
      entityId: dungeon.id,
      newValue: { dungeonName, abbreviation },
    });
  });

  revalidateSeason();
}

export async function deleteDungeon(id: string) {
  const admin = await requireAdmin();

  const dungeon = await prisma.seasonDungeon.findUniqueOrThrow({ where: { id } });

  await prisma.$transaction(async (tx) => {
    await tx.seasonDungeon.delete({ where: { id } });

    await writeAuditLog(tx, {
      actorId: admin.id,
      actionType: "DUNGEON_DELETED",
      entityType: "SeasonDungeon",
      entityId: id,
      oldValue: {
        dungeonName: dungeon.dungeonName,
        abbreviation: dungeon.abbreviation,
      },
    });
  });

  revalidateSeason();
}

/**
 * Doplní časové limity dungeonů podle Raider.io. Páruje se přes zkratku -
 * názvy se mezi Raider.io a naší evidencí liší (Kings' Rest vs King's Rest).
 */
export async function syncDungeonTimes(formData: FormData) {
  const admin = await requireAdmin();
  const seasonId = String(formData.get("seasonId"));

  const season = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
  });

  if (!season.raiderioSeasonSlug) {
    redirect(
      "/admin/season?error=" +
        encodeURIComponent(
          "Sezóna nemá vyplněný slug Raider.io sezóny (např. season-mn-2)."
        )
    );
  }

  let fromRaiderio;
  try {
    fromRaiderio = await fetchSeasonDungeons(season.raiderioSeasonSlug);
  } catch (err) {
    redirect(
      "/admin/season?error=" +
        encodeURIComponent(
          err instanceof RaiderioLookupError
            ? err.message
            : "Stažení dungeonů z Raider.io se nezdařilo."
        )
    );
  }

  const timesByAbbreviation = new Map(
    fromRaiderio.map((d) => [d.abbreviation.toUpperCase(), d.timeLimitSeconds])
  );

  const dungeons = await prisma.seasonDungeon.findMany({ where: { seasonId } });
  const missing: string[] = [];
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const dungeon of dungeons) {
      const timeLimitSeconds = timesByAbbreviation.get(
        dungeon.abbreviation.toUpperCase()
      );

      if (timeLimitSeconds === undefined) {
        missing.push(dungeon.abbreviation);
        continue;
      }

      if (timeLimitSeconds === dungeon.timeLimitSeconds) continue;

      await tx.seasonDungeon.update({
        where: { id: dungeon.id },
        data: { timeLimitSeconds },
      });

      await writeAuditLog(tx, {
        actorId: admin.id,
        actionType: "DUNGEON_TIME_SYNCED",
        entityType: "SeasonDungeon",
        entityId: dungeon.id,
        oldValue: { timeLimitSeconds: dungeon.timeLimitSeconds },
        newValue: { timeLimitSeconds },
      });

      updated++;
    }
  });

  revalidateSeason();

  const params = new URLSearchParams({ synced: String(updated) });
  if (missing.length > 0) {
    params.set("missing", missing.join(", "));
  }
  redirect("/admin/season?" + params);
}
