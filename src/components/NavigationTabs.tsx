export type NavItem = {
  id: string;
  label: string;
  badge?: string;
};

type NavigationTabsProps = {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
};

export function NavigationTabs({
  items,
  activeId,
  onSelect,
}: NavigationTabsProps) {
  return (
    <div className="nav-tabs">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="nav-tab"
          data-active={activeId === item.id}
          onClick={() => onSelect(item.id)}
        >
          <span>{item.label}</span>
          {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
