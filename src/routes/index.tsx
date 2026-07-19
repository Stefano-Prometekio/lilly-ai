import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  ChevronRight,
  FolderOpen,
  PhoneCall,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

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
  const [pendingDeleteId, setPendingDeleteId] = useState<string>();

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
    setPendingDeleteId(undefined);
  }

  const pendingDeleteProject = projects.find((project) => project.id === pendingDeleteId);

  return (
    <div className="home-shell">
      <div className="home-inner">
        <div className="home-hero">
          <div className="home-hero__copy">
            <div className="home-brand">
              <span className="brand-mark">L</span>
              <span>Lilly</span>
            </div>
            <div className="home-eyebrow">
              <Sparkles size={15} /> AI event sourcing assistant
            </div>
            <h1>Find the right event vendors with confidence.</h1>
            <p>
              Turn your event plan into a clear brief, understand local pricing, gather comparable
              offers, and improve the strongest one — with Lilly guiding every step.
            </p>
            <div className="home-trust">
              <span>
                <BadgeCheck size={15} /> You approve every decision
              </span>
              <span>
                <BadgeCheck size={15} /> Sources stay linked
              </span>
            </div>
            <div className="home-cta">
              {!creating ? (
                <>
                  <button className="home-btn home-btn--primary" onClick={() => setCreating(true)}>
                    <Plus size={18} /> Start sourcing vendors
                  </button>
                  <a href="#previous" className="home-btn home-btn--ghost">
                    <FolderOpen size={18} /> Open past projects
                  </a>
                </>
              ) : (
                <div className="home-create">
                  <input
                    autoFocus
                    className="home-input"
                    aria-label="Event name"
                    placeholder="Event name, e.g. Anna & Marc's wedding"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createProject()}
                  />
                  <button className="home-btn home-btn--primary" onClick={createProject}>
                    Create workspace <ChevronRight size={16} />
                  </button>
                  <button className="home-btn home-btn--ghost" onClick={() => setCreating(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <aside className="home-preview" aria-label="How Lilly helps">
            <div className="home-preview__top">
              <span>Your sourcing plan</span>
              <small>4 guided stages</small>
            </div>
            <ol>
              <li className="is-active">
                <span>
                  <Sparkles size={17} />
                </span>
                <div>
                  <strong>Shape the brief</strong>
                  <small>Voice, document, or manual entry</small>
                </div>
                <BadgeCheck size={17} />
              </li>
              <li>
                <span>
                  <Search size={17} />
                </span>
                <div>
                  <strong>Understand the market</strong>
                  <small>Local options and pricing signals</small>
                </div>
              </li>
              <li>
                <span>
                  <PhoneCall size={17} />
                </span>
                <div>
                  <strong>Gather offers</strong>
                  <small>Comparable vendor conversations</small>
                </div>
              </li>
              <li>
                <span>
                  <BadgeCheck size={17} />
                </span>
                <div>
                  <strong>Choose confidently</strong>
                  <small>Clear comparison and recommendation</small>
                </div>
              </li>
            </ol>
            <div className="home-preview__note">
              <span className="live-dot" /> Lilly keeps you in control from first brief to final
              choice.
            </div>
          </aside>
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
                    onClick={() => setPendingDeleteId(p.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pendingDeleteProject && (
        <div className="home-dialog-backdrop" role="presentation">
          <div
            className="home-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
          >
            <span className="home-dialog__icon">
              <Trash2 size={20} />
            </span>
            <h2 id="delete-project-title">Delete this project?</h2>
            <p>
              “{pendingDeleteProject.name}” will be removed from this browser. This cannot be
              undone.
            </p>
            <div>
              <button
                className="home-btn home-btn--ghost"
                onClick={() => setPendingDeleteId(undefined)}
              >
                Keep project
              </button>
              <button
                className="home-btn home-btn--danger"
                onClick={() => deleteProject(pendingDeleteProject.id)}
              >
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
