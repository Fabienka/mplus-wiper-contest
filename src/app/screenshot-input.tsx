"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_MAX_PIXELS,
  SCREENSHOT_QUALITY,
  SCREENSHOT_TYPES,
  fitWithinPixels,
} from "@/lib/manual-result";

type State =
  | { kind: "empty" }
  | { kind: "working" }
  | {
      kind: "ready";
      previewUrl: string;
      originalBytes: number;
      finalBytes: number;
      width: number;
      height: number;
      shrunk: boolean;
    }
  | { kind: "error"; message: string };

const WORKING_MESSAGE = "Obrázek se ještě zmenšuje, chvilku počkej.";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/**
 * Zmenší obrázek na nejvýš SCREENSHOT_MAX_PIXELS bodů a zakóduje ho do WebP.
 * Prohlížeč, který WebP zakódovat neumí (Safari před verzí 17), vrátí
 * z toBlob potichu PNG - pak se použije JPEG.
 */
async function shrinkImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithinPixels(bitmap.width, bitmap.height, SCREENSHOT_MAX_PIXELS);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas není k dispozici.");

  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, SCREENSHOT_QUALITY));

  let blob = await encode("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg");
  if (!blob) throw new Error("Obrázek se nepodařilo zakódovat.");

  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  const name = `${file.name.replace(/\.[^.]+$/, "") || "screenshot"}.${extension}`;

  return { file: new File([blob], name, { type: blob.type }), width, height };
}

/**
 * Výběr screenshotu, který obrázek před odesláním zmenší v prohlížeči.
 *
 * Screenshot ze 4K má v PNG klidně 15 MB - takový by se na server ani do
 * databáze nehodil. Tady se po výběru zmenší na nejvýš 2560 × 1440 a převede
 * do WebP (obvykle 1-2 MB) a ve formuláři se vymění za původní soubor.
 * Pod polem je náhled přesně toho, co se odešle.
 *
 * Když zmenšení selže (formát, který prohlížeč neumí načíst), odešle se
 * soubor v původní podobě a o zbytek se postará kontrola na serveru.
 */
export function ScreenshotInput({
  id,
  name,
  label,
  required,
  style,
}: {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  style?: React.CSSProperties;
}) {
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  /** Pořadí výběru - výsledek zmenšení staršího souboru se zahodí. */
  const selection = useRef(0);
  const [state, setState] = useState<State>({ kind: "empty" });

  // Náhled drží obrázek v paměti, dokud se jeho adresa neuvolní.
  const previewUrl = state.kind === "ready" ? state.previewUrl : null;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Reset formuláře vyprázdní pole - náhled musí zmizet s ním.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;

    const onReset = () => setState({ kind: "empty" });
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const onChange = async () => {
    const input = inputRef.current;
    const file = input?.files?.[0];
    const current = ++selection.current;

    if (!input || !file) {
      input?.setCustomValidity("");
      setState({ kind: "empty" });
      return;
    }

    // Dokud se zmenšuje, formulář nejde odeslat - odešel by původní soubor.
    input.setCustomValidity(WORKING_MESSAGE);
    setState({ kind: "working" });

    try {
      const shrunk = await shrinkImage(file);
      if (current !== selection.current) return;

      // Malý obrázek v přijímaném formátu může být v originále menší než po
      // převodu - pak se nechá, jak je.
      const keepOriginal =
        shrunk.file.size >= file.size &&
        (SCREENSHOT_TYPES as readonly string[]).includes(file.type);
      const final = keepOriginal ? file : shrunk.file;

      if (!keepOriginal) {
        const transfer = new DataTransfer();
        transfer.items.add(final);
        input.files = transfer.files;
      }

      input.setCustomValidity(
        final.size > MAX_SCREENSHOT_BYTES
          ? `Obrázek je i po zmenšení větší než ${MAX_SCREENSHOT_BYTES / 1024 / 1024} MB.`
          : ""
      );

      setState({
        kind: "ready",
        previewUrl: URL.createObjectURL(final),
        originalBytes: file.size,
        finalBytes: final.size,
        width: shrunk.width,
        height: shrunk.height,
        shrunk: !keepOriginal,
      });
    } catch {
      if (current !== selection.current) return;

      input.setCustomValidity("");
      setState({
        kind: "error",
        message:
          "Obrázek se v prohlížeči nepodařilo zmenšit, odešle se v původní podobě. Server bere PNG, JPEG a WebP do 8 MB.",
      });
    }
  };

  return (
    <div className="field" style={style}>
      <label htmlFor={id}>{label}</label>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept="image/*"
        required={required}
        aria-describedby={hintId}
        onChange={onChange}
      />

      <p id={hintId} className="field-hint" aria-live="polite" style={{ margin: 0 }}>
        {state.kind === "empty" && "Velký screenshot se před odesláním sám zmenší."}
        {state.kind === "working" && "Zmenšuji obrázek…"}
        {state.kind === "ready" &&
          (state.shrunk
            ? `Zmenšeno z ${formatSize(state.originalBytes)} na ${formatSize(state.finalBytes)} (${state.width} × ${state.height} px). Takhle se odešle:`
            : `Odešle se v původní podobě (${formatSize(state.finalBytes)}):`)}
        {state.kind === "error" && state.message}
      </p>

      {state.kind === "ready" && (
        <a
          className="screenshot-preview"
          href={state.previewUrl}
          target="_blank"
          rel="noopener"
          title="Otevřít v plné velikosti"
        >
          {/* Obyčejný <img>: náhled je blob: adresa, next/image ji neumí. */}
          <img src={state.previewUrl} alt="Náhled screenshotu, který se odešle" />
        </a>
      )}
    </div>
  );
}
