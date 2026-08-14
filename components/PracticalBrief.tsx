"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { PracticalTask } from "@/lib/content";
import { parsePracticalRequirements } from "@/lib/practical-requirements.mjs";

export function PracticalBrief({ task, open = true }: { task: PracticalTask; open?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const titleId = useId();
  const parsed = useMemo(() => parsePracticalRequirements(task.description), [task.description]);
  const sheet = task.officialTaskSheet;

  useEffect(() => {
    if (!dialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    const backgroundFrames = Array.from(document.querySelectorAll("iframe")).map((frame) => ({
      frame,
      inert: frame.inert,
      inertAttribute: frame.hasAttribute("inert"),
      tabIndex: frame.getAttribute("tabindex"),
    }));
    const containFocus = (event: FocusEvent) => {
      const dialog = dialogRef.current;
      if (!dialog?.open || !(event.target instanceof Node) || dialog.contains(event.target)) return;
      closeButtonRef.current?.focus();
    };
    document.body.style.overflow = "hidden";
    for (const { frame } of backgroundFrames) {
      frame.inert = true;
      frame.setAttribute("inert", "");
      frame.setAttribute("tabindex", "-1");
    }
    document.addEventListener("focusin", containFocus, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      for (const { frame, inert, inertAttribute, tabIndex } of backgroundFrames) {
        frame.inert = inert;
        if (!inertAttribute) frame.removeAttribute("inert");
        if (tabIndex === null) frame.removeAttribute("tabindex");
        else frame.setAttribute("tabindex", tabIndex);
      }
      document.removeEventListener("focusin", containFocus, true);
    };
  }, [dialogOpen]);

  function showOfficialPrompt() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    closeButtonRef.current?.focus();
    setDialogOpen(true);
  }

  function closeOfficialPrompt() {
    dialogRef.current?.close();
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) closeOfficialPrompt();
  }

  return <>
    <details className="practical-brief" open={open}>
      <summary>
        <span>题目要求</span>
        <small>{parsed.requirements.length ? `${parsed.requirements.length} 条要求` : "完整题面"}</small>
      </summary>
      <div className="practical-brief-body">
        <button type="button" className="practical-full-prompt-trigger" onClick={showOfficialPrompt}>
          查看完整官方题目
          <span aria-hidden="true">↗</span>
        </button>
        {parsed.requirements.length > 0
          ? <ol className="practical-requirement-list">
            {parsed.requirements.map((requirement, index) => <li key={`${requirement.marker}-${index}`}>
              <span aria-hidden="true">{requirement.marker}</span>
              <p>{requirement.text}</p>
            </li>)}
          </ol>
          : <p className="practical-brief-empty">本题未按编号拆分任务，请查看完整官方题目。</p>}
      </div>
    </details>

    {/* Native <dialog> exclusively owns Escape/cancel. onClose only mirrors
        the resulting browser state into React, avoiding two competing closers. */}
    <dialog
      ref={dialogRef}
      className="practical-prompt-dialog"
      aria-labelledby={titleId}
      onClick={closeFromBackdrop}
      onClose={() => setDialogOpen(false)}
    >
      <article className="practical-prompt-document">
        <header>
          <div>
            <p className="eyebrow">官方题面 · {task.code}</p>
            <h2 id={titleId}>完整官方题目</h2>
            <p>{task.title}</p>
          </div>
          <button ref={closeButtonRef} type="button" className="practical-prompt-close" aria-label="关闭完整官方题目" autoFocus onClick={closeOfficialPrompt}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="practical-prompt-content">
          <section>
            <h3>题目原文</h3>
            <p>{task.description}</p>
          </section>
          {sheet?.equipmentRequirements && <section>
            <h3>场地设备要求</h3>
            <p>{sheet.equipmentRequirements}</p>
          </section>}
          {sheet?.skillRequirements && <section>
            <h3>技能要求</h3>
            <p>{sheet.skillRequirements}</p>
          </section>}
          {sheet?.qualityIndicators && <section>
            <h3>质量指标</h3>
            <p>{sheet.qualityIndicators}</p>
          </section>}
        </div>
        <footer>
          <span>以上内容保持官方题目原文，仅调整阅读方式。</span>
          <button type="button" onClick={closeOfficialPrompt}>返回作答</button>
        </footer>
      </article>
    </dialog>
  </>;
}
