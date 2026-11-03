"use client";

interface StudentGroupTab {
  _id: string;
  name: string;
}

interface StudentGroupTabsProps {
  groups: StudentGroupTab[];
  selectedGroupId: string;
  onSelect: (groupId: string) => void;
  label: string;
}

export function StudentGroupTabs({
  groups,
  selectedGroupId,
  onSelect,
  label,
}: StudentGroupTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="mb-5 flex gap-2 overflow-x-auto p-3"
    >
      <button
        type="button"
        role="tab"
        aria-selected={selectedGroupId === ""}
        onClick={() => onSelect("")}
        className={`shrink-0 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition ${
          selectedGroupId === ""
            ? "bg-violet-600 text-white shadow-lg shadow-violet-200"
            : "bg-white text-slate-600 shadow-sm hover:bg-violet-50"
        }`}
      >
        Hamısı
      </button>
      {groups.map((group) => (
        <button
          key={group._id}
          type="button"
          role="tab"
          aria-selected={selectedGroupId === group._id}
          onClick={() => onSelect(group._id)}
          className={`shrink-0 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition ${
            selectedGroupId === group._id
              ? "bg-violet-600 text-white shadow-lg shadow-violet-200"
              : "bg-white text-slate-600 shadow-sm hover:bg-violet-50"
          }`}
        >
          {group.name}
        </button>
      ))}
    </div>
  );
}
