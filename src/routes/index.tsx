import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sparkles, Plus, FolderOpen, ChevronRight, Trash2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Home,
  ssr: false,
});

interface StoredProject {
  id: string;
  name: string;
  createdAt: string;
}

const STORAGE_KEY = "lilly.projects";

function loadProjects(): StoredProject[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProjects(list: StoredProject[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function Home() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  function createProject() {
    const trimmed = name.trim() || `Untitled event ${new Date().toLocaleDateString()}`;
    const project: StoredProject = {
      id: `proj_${Date.now()}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
    };
    const next = [project, ...projects];
    saveProjects(next);
    window.localStorage.setItem("lilly.activeProject", project.id);
    navigate({ to: "/campaign" });
  }

  function openProject(id: string) {
    window.localStorage.setItem("lilly.activeProject", id);
    navigate({ to: "/campaign" });
  }

  function deleteProject(id: string) {
    const next = projects.filter((p) => p.id !== id);
    saveProjects(next);
    setProjects(next);
  }

  return (
    <div className="home-shell">
      <div className="home-inner">
        <div className="home-hero">
          <div className="home-brand">
            <span className="brand-mark">L</span>
            <span>Lilly</span>
          </div>
          <h1>
            Welcome to Lilly, your AI assistant<br />for sourcing event vendors.
          </h1>
          <p>
            Define your event, let Lilly research the market, call vendors, and negotiate on your
            behalf — all in one place.
          </p>
          <div className="home-cta">
            {!creating ? (
              <>
                <button className="home-btn home-btn--primary" onClick={() => setCreating(true)}>
                  <Plus size={18} /> Create a new project
                </button>
                <a href="#previous" className="home-btn home-btn--ghost">
                  <FolderOpen size={18} /> See previous projects
                </a>
              </>
            ) : (
              <div className="home-create">
                <input
                  autoFocus
                  className="home-input"
                  placeholder="Event name (e.g. Anna & Marc wedding)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createProject()}
                />
                <button className="home-btn home-btn--primary" onClick={createProject}>
                  Start <ChevronRight size={16} />
                </button>
                <button className="home-btn home-btn--ghost" onClick={() => setCreating(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div id="previous" className="home-projects">
          <div className="home-projects__header">
            <Sparkles size={16} /> Previous projects
          </div>
          {projects.length === 0 ? (
            <p className="home-empty">No projects yet. Create your first one above.</p>
          ) : (
            <ul>
              {projects.map((p) => (
                <li key={p.id}>
                  <button className="home-project" onClick={() => openProject(p.id)}>
                    <span>
                      <strong>{p.name}</strong>
                      <small>{new Date(p.createdAt).toLocaleString()}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                  <button
                    className="home-project__delete"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => deleteProject(p.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
