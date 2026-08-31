-- Přejmenování, ne drop+add: hodnoty se zachovají.
-- Význam pole se mění z koeficientu (100 / limit) na násobitel časového bonusu,
-- kde 1 = bez zvýhodnění. Stávající hodnoty jsou shodou okolností 1, takže
-- odpovídají novému významu bez přepočtu.
ALTER TABLE "SeasonDungeon" RENAME COLUMN "coefficient" TO "bonusMultiplier";
ALTER TABLE "SeasonDungeon" ALTER COLUMN "bonusMultiplier" SET DEFAULT 1;
