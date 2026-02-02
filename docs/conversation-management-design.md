# Conversation Management System Design

## Overview

Replace the single-stream channel model with proper conversation management featuring projects, search, and archiving.

## Data Model

### Conversation
```typescript
{
  id: string;              // ULID
  title: string;           // User-provided or auto-generated
  project_id: string | null;
  channel_id: string;      // Still support channels for organization
  created_at: string;      // ISO timestamp
  updated_at: string;      // ISO timestamp
  status: 'active' | 'archived';
  message_count: number;
  last_message_preview: string;
}
```

### Project
```typescript
{
  id: string;              // ULID
  name: string;
  description: string;
  color: string;           // Hex color for UI
  created_at: string;
}
```

## Storage Structure

```
.forgekeeper/conversation_spaces/
  conversations/
    {conversation_id}.jsonl          # Messages for each conversation
  metadata/
    conversations.jsonl               # Conversation metadata (append-only)
    projects.jsonl                    # Project metadata (append-only)
  archives/
    {conversation_id}.jsonl           # Archived conversations
```

## API Endpoints

### Conversations
- `GET /api/conversation-space/conversations` - List all conversations with filters
  - Query params: `?status=active&project_id=X&limit=50`
- `POST /api/conversation-space/conversations` - Create new conversation
  - Body: `{title?, project_id?, channel_id?}`
- `GET /api/conversation-space/conversations/:id` - Get conversation details
- `PUT /api/conversation-space/conversations/:id` - Update conversation
  - Body: `{title?, project_id?}`
- `POST /api/conversation-space/conversations/:id/archive` - Archive conversation
- `DELETE /api/conversation-space/conversations/:id` - Delete permanently (admin only)
- `GET /api/conversation-space/conversations/:id/messages` - Get messages
- `POST /api/conversation-space/conversations/:id/messages` - Add message

### Projects
- `GET /api/conversation-space/projects` - List all projects
- `POST /api/conversation-space/projects` - Create project
  - Body: `{name, description?, color?}`
- `PUT /api/conversation-space/projects/:id` - Update project
- `DELETE /api/conversation-space/projects/:id` - Delete project (moves convos to null)

### Search
- `GET /api/conversation-space/search` - Search across conversations
  - Query params: `?q=query&limit=20&project_id=X&status=archived`
  - Returns: `{results: [{conversation, message, score}]}`

## UI Components

### ConversationList Sidebar
- Replaces current agent sidebar (agents move to top bar or separate panel)
- Shows active conversations grouped by project
- "New Conversation" button at top
- Search bar
- Project filter dropdown

### ConversationHeader
- Current conversation title (editable inline)
- Project badge
- Archive button (replaces Clear)
- Settings menu

### ProjectOrganizer Modal
- Create/edit projects
- Assign conversations to projects
- Set project colors

## Agent Integration

### Context Isolation
- Agents only see current conversation by default
- Agent context summary scoped to conversation_id

### Search Tool
New tool: `search_conversations`
```typescript
{
  name: "search_conversations",
  description: "Search previous conversations for relevant information",
  parameters: {
    query: string,
    limit?: number,
    project_id?: string
  }
}
```

Returns relevant messages from past conversations with context.

## Migration Strategy

1. Create new storage structure
2. Migrate existing channel messages to a "Legacy" conversation
3. Dual-mode: Support both old and new APIs temporarily
4. Update UI to use new conversation endpoints
5. Remove old channel-based storage after validation

## Implementation Phases

### Phase 1: Backend Foundation
- Create metadata storage
- Implement conversation CRUD endpoints
- Implement project CRUD endpoints
- Migration script for existing messages

### Phase 2: UI Components
- ConversationList sidebar
- New Conversation button
- Archive functionality
- Project selector

### Phase 3: Search & Agent Tools
- Full-text search implementation
- Agent search_conversations tool
- Context isolation updates

### Phase 4: Polish
- Auto-title generation
- Project colors and organization
- Conversation export
- Bulk operations
