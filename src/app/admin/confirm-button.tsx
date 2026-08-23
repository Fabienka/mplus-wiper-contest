"use client";

/** Tlačítko v server-rendered formuláři, které se před odesláním zeptá. */
export function ConfirmButton({
  children,
  message,
  className,
  formAction,
  form,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  form?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      form={form}
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
