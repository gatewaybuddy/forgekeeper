import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationService } from './conversationService';

const apolloMocks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@apollo/client', () => apolloMocks);

const graphqlMocks = vi.hoisted(() => ({
  SEND_MESSAGE: Symbol('SEND_MESSAGE'),
  STOP_MESSAGE: Symbol('STOP_MESSAGE'),
  LIST_CONVERSATIONS: Symbol('LIST_CONVERSATIONS'),
  MOVE_CONVERSATION: Symbol('MOVE_CONVERSATION'),
  DELETE_CONVERSATION: Symbol('DELETE_CONVERSATION'),
  ARCHIVE_CONVERSATION: Symbol('ARCHIVE_CONVERSATION'),
  SET_RUNTIME_CONFIG: Symbol('SET_RUNTIME_CONFIG'),
}));

vi.mock('../../../graphql', () => graphqlMocks);

const useMutationMock = apolloMocks.useMutation;
const useQueryMock = apolloMocks.useQuery;

describe('useConversationService', () => {
  beforeEach(() => {
    useMutationMock.mockReset();
    useQueryMock.mockReset();
  });

  it('sends projectId with message when provided', async () => {
    const sendMutation = vi.fn().mockResolvedValue(undefined);

    useMutationMock
      .mockReturnValueOnce([sendMutation, { loading: false }])
      .mockReturnValueOnce([vi.fn(), { loading: false }])
      .mockReturnValueOnce([vi.fn(), { loading: false }])
      .mockReturnValueOnce([vi.fn(), { loading: false }])
      .mockReturnValueOnce([vi.fn(), { loading: false }])
      .mockReturnValueOnce([vi.fn(), { loading: false }]);

    useQueryMock.mockReturnValue({
      data: { listConversations: [] },
      loading: false,
      refetch: vi.fn(),
    });

    const transport = useConversationService('project-123');
    await transport.sendMessage('Hello');

    expect(sendMutation).toHaveBeenCalledWith({
      variables: {
        topic: 'forgekeeper/task',
        message: { content: 'Hello' },
        projectId: 'project-123',
      },
    });
  });
});
