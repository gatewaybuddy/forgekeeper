import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { projectIdVar } from '../../apolloClient';

type ProjectContextValue = {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
};

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export interface ProjectProviderProps {
  children: React.ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    projectIdVar(projectId);
  }, [projectId]);

  const value = useMemo(() => ({ projectId, setProjectId }), [projectId, setProjectId]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return ctx;
}
