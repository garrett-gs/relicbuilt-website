"use client";

import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Project } from "@/types";
import { useState } from "react";

interface ProjectModalProps {
  project: Project;
  onClose: () => void;
}

export default function ProjectModal({ project, onClose }: ProjectModalProps) {
  const [imageIndex, setImageIndex] = useState(0);

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-50" onClick={onClose} />
      <div className="fixed inset-4 md:inset-12 bg-background border border-border z-50 overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted hover:text-foreground transition-colors z-10"
        >
          <X size={24} />
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
          {/* Image carousel area */}
          <div className="relative bg-card flex items-center justify-center min-h-[300px]">
            <p className="text-muted text-sm">
              Image {imageIndex + 1} of {Math.max(project.images.length, 1)}
            </p>
            {project.images.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setImageIndex((i) =>
                      i > 0 ? i - 1 : project.images.length - 1
                    )
                  }
                  className="absolute left-4 text-muted hover:text-foreground"
                >
                  <ChevronLeft size={32} />
                </button>
                <button
                  onClick={() =>
                    setImageIndex((i) =>
                      i < project.images.length - 1 ? i + 1 : 0
                    )
                  }
                  className="absolute right-4 text-muted hover:text-foreground"
                >
                  <ChevronRight size={32} />
                </button>
              </>
            )}
          </div>

          {/* Details */}
          <div className="p-8 lg:p-12 flex flex-col justify-center">
            <span className="text-accent text-xs uppercase tracking-wider mb-2">
              {project.category}
            </span>
            <h2 className="text-3xl font-bold mb-4">{project.title}</h2>
            <p className="text-muted leading-relaxed mb-6">
              {project.description}
            </p>
            {project.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs uppercase tracking-wider px-3 py-1 border border-border text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
