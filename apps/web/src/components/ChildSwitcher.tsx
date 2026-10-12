export interface ChildOption {
  id: string;
  name: string;
  class: string;
}

interface ChildSwitcherProps {
  options: ChildOption[];
  activeId: string;
  onChange: (id: string) => void;
}

export function ChildSwitcher({ options, activeId, onChange }: ChildSwitcherProps) {
  if (options.length <= 1) return null;

  return (
    <div className="cs-group" role="group" aria-label="Select child">
      {options.map((child) => (
        <button
          type="button"
          key={child.id}
          className={`cs-btn${child.id === activeId ? " cs-active" : ""}`}
          onClick={() => onChange(child.id)}
          aria-pressed={child.id === activeId}
        >
          <span className="cs-name">{child.name}</span>
          <span className="cs-class">{child.class}</span>
        </button>
      ))}
    </div>
  );
}
