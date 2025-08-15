import React, { useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { LIST_PROJECTS, CREATE_PROJECT } from './graphql';
import { Project } from './types';
import { Box, FormControl, InputLabel, Select, MenuItem, IconButton } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

interface ProjectSelectorProps {
  value: string | null;
  onChange: (_id: string) => void;
}

export default function ProjectSelector({ value, onChange }: ProjectSelectorProps) {
  const { data, loading, refetch } = useQuery<{ listProjects: Project[] }>(LIST_PROJECTS);
  const [createProject] = useMutation(CREATE_PROJECT);

  useEffect(() => {
    if (!value && data?.listProjects.length) {
      onChange(data.listProjects[0].id);
    }
  }, [data, value, onChange]);

  const handleAdd = async () => {
    const name = window.prompt('Project name');
    if (name) {
      const res = await createProject({ variables: { name } });
      await refetch();
      const newId = res.data?.createProject.id;
      if (newId) onChange(newId);
    }
  };

  return (
    <Box display="flex" alignItems="center" gap={1}>
      <FormControl size="small" sx={{ minWidth: 120 }} disabled={loading}>
        <InputLabel id="project-select-label">Project</InputLabel>
        <Select
          labelId="project-select-label"
          label="Project"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {data?.listProjects.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <IconButton size="small" onClick={handleAdd}>
        <AddIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
