import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Keeps configuration mounted while removing collapsed controls from keyboard navigation. */
export function SettingsDisclosure({ title, description, children }: {
  title: string; description: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className={`settings-disclosure ${open ? "is-expanded" : ""}`}>
      <button className="settings-disclosure-trigger" type="button" aria-expanded={open}
        aria-controls={id} data-sound="tick" onClick={() => setOpen(value => !value)}>
        <span><strong>{title}</strong><small>{description}</small></span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div className="settings-disclosure-reveal" id={id} inert={!open} aria-hidden={!open}
        onKeyDown={event => {
          if (event.key === "Escape") {
            event.stopPropagation();
            const trigger = event.currentTarget.previousElementSibling as HTMLButtonElement | null;
            trigger?.focus();
            setOpen(false);
          }
        }}>
        <div className="settings-disclosure-clip"><div className="settings-disclosure-content">{children}</div></div>
      </div>
    </section>
  );
}
