import { useReducer, useEffect } from 'react';
import { Conversation } from '../../types';

type FolderAction =
  | { type: 'set'; payload: string[] }
  | { type: 'add'; name: string }
  | { type: 'rename'; oldName: string; newName: string }
  | { type: 'merge'; payload: string[] };

const folderReducer = (state: string[], action: FolderAction): string[] => {
  switch (action.type) {
    case 'set':
      return action.payload;
    case 'add':
      return state.includes(action.name) ? state : [...state, action.name];
    case 'rename':
      return state.map(f => (f === action.oldName ? action.newName : f));
    case 'merge':
      return Array.from(new Set([...state, ...action.payload]));
    default:
      return state;
  }
};

export default function useFolders(conversations: Conversation[]) {
  const [folders, dispatch] = useReducer(folderReducer, []);

  useEffect(() => {
    const derived = Array.from(
      new Set(conversations.map(c => c.folder).filter(Boolean) as string[])
    );
    dispatch({ type: 'merge', payload: derived });
  }, [conversations]);

  const addFolder = (name: string) => dispatch({ type: 'add', name });
  const renameFolder = (oldName: string, newName: string) =>
    dispatch({ type: 'rename', oldName, newName });

  return { folders, addFolder, renameFolder };
}
