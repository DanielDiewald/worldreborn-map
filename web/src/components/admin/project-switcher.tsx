"use client";

import { useRouter } from "next/navigation";

export type ProjectSwitcherItem = {
  id: number;
  name: string;
};

export function ProjectSwitcher({ projects, currentProjectId }: { projects: ProjectSwitcherItem[]; currentProjectId?: number }) {
  const router = useRouter();

  return (
    <label className="project-switcher" aria-label="Projekt wechseln">
      <span className="project-switcher-dot" aria-hidden="true" />
      <select
        value={currentProjectId ? String(currentProjectId) : ""}
        onChange={(event) => {
          const id = Number.parseInt(event.target.value, 10);
          if (Number.isSafeInteger(id) && id > 0) router.push(`/admin/projects/${id}`);
        }}
      >
        {!currentProjectId ? <option value="">Projekt auswählen</option> : null}
        {projects.map((project) => (
          <option key={project.id} value={project.id}>{project.name}</option>
        ))}
      </select>
    </label>
  );
}
