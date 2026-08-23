"use client";

/** Tlačítko v server-rendered formuláři, které se před odesláním zeptá. */
export function ConfirmButton({
  children,
  message,
  className,
  formAction,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
