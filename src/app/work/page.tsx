"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import FilterBar from "@/components/work/FilterBar";
import ProjectCard from "@/components/work/ProjectCard";
import ProjectModal from "@/components/work/ProjectModal";
import { Project } from "@/types";

// Sample data — will be replaced with Supabase queries
const sampleProjects: Project[] = [
  {
    id: "1",
    title: "Custom Shuffleboard Table",
    slug: "custom-shuffleboard-table",
    description: "Handcrafted shuffleboard table with steel frame and reclaimed wood playing surface.",
    category: "mixed",
    tags: ["residential", "furniture", "gaming"],
    images: [],
    featured: true,
    created_at: "2024-01-01",
  },
  {
    id: "2",
    title: "Built-In Cabinetry",
    slug: "built-in-cabinetry",
    description: "Floor-to-ceiling custom cabinetry with soft-close hinges and premium hardwood construction.",
    category: "woodworking",
    tags: ["residential", "cabinetry"],
    images: [],
    featured: false,
    created_at: "2024-02-01",
  },
  {
    id: "3",
    title: "Steel Staircase Railing",
    slug: "steel-staircase-railing",
    description: "Modern steel railing system with clean lines and industrial finish.",
    category: "metalworking",
    tags: ["residential", "architectural"],
    images: [],
    featured: false,
    created_at: "2024-03-01",
  },
  {
    id: "4",
    title: "Executive Desk",
    slug: "executive-desk",
    description: "Solid walnut executive desk with integrated cable management and steel legs.",
    category: "mixed",
    tags: ["commercial", "furniture"],
    images: [],
    featured: true,
    created_at: "2024-04-01",
  },
  {
    id: "5",
    title: "Wine Cellar Shelving",
    slug: "wine-cellar-shelving",
    description: "Custom wine cellar with temperature-controlled storage and display shelving in oak.",
    category: "woodworking",
    tags: ["residential", "specialty"],
    images: [],
    featured: false,
    created_at: "2024-05-01",
  },
  {
    id: "6",
    title: "Commercial Reception Desk",
    slug: "commercial-reception-desk",
    description: "Large-scale reception desk with metal accents and backlit panel for a corporate lobby.",
    category: "mixed",
    tags: ["commercial", "furniture"],
    images: [],
    featured: true,
    created_at: "2024-06-01",
  },
];

export default function WorkPage() {
  const [filter, setFilter] = useState("all");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const filtered =
    filter === "all"
      ? sampleProjects
      : sampleProjects.filter((p) => p.category === filter);

  return (
    <div className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Our Work
          </h1>
          <p className="text-muted mb-8">
            A selection of projects showcasing our craftsmanship across
            woodworking, metalworking, and mixed-media builds.
          </p>
        </motion.div>

        <FilterBar active={filter} onChange={setFilter} />

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((project, i) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={i}
              onClick={() => setSelectedProject(project)}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-muted text-center py-12">
            No projects in this category yet.
          </p>
        )}

        {selectedProject && (
          <ProjectModal
            project={selectedProject}
            onClose={() => setSelectedProject(null)}
          />
        )}
      </div>
    </div>
  );
}
