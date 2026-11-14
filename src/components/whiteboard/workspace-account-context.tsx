"use client";
import { createContext, useContext } from "react";
import type { WorkspaceAccount } from "@/lib/learning/workspace-account";
export const WorkspaceAccountContext = createContext<WorkspaceAccount | null>(null);
export function useWorkspaceAccount() { return useContext(WorkspaceAccountContext); }
