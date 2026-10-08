import React, { useLayoutEffect, useRef } from "react";
import "./projectResumeDialog.css";

export function ProjectResumeDialog({ title, onCancel }: { title: string | null; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (title && !element?.open) element?.showModal();
    if (!title && element?.open) element.close();
  }, [title]);
  return <dialog ref={dialog} className="project-resume-dialog" data-testid="project-resume-progress" aria-labelledby="project-resume-heading" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="project-resume-heading">Opening {title ?? "saved Project"}</h2>
    <p role="status">Restoring saved documents…</p>
    <button data-testid="project-resume-cancel" onClick={onCancel}>Cancel opening</button>
  </dialog>;
}
