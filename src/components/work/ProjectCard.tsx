"use client";

import { motion } from "framer-motion";
import { Project } from "@/types";

interface ProjectCardProps {
  project: Project;
  index: number;
  onClick: () => void;
}

export default function ProjectCard({
  project,
  index,
  onClick,
}: ProjectCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      onClick={onClick}
      className="group cursor-pointer"
    >
      <div className="relative aspect-[4/3] bg-card border border-border overflow-hidden">
        {/* Image placeholder — will use next/image with Supabase Storage URLs */}
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-muted text-xs uppercase tracking-wider">
            {project.title}
          </p>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center">
          <h3 className="text-lg font-bold mb-1">{project.title}</h3>
          <span className="text-accent text-xs uppercase tracking-wider">
            {project.category}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
