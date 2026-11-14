import type { Metadata } from "next";
import StudyShell from "@/components/whiteboard/StudyShell";
import "./study.css";

export const metadata: Metadata = { title: "Study workspace | Newton", description: "Work through Algebra I on a local whiteboard or with structured math input." };

export default function StudyPage() {
  return <StudyShell />;
}
