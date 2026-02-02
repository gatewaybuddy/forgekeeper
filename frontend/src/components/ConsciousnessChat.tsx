/**
 * Consciousness Chat Component
 *
 * Conversational interface for interacting with the consciousness system.
 * Provides chat-based Q&A, goal management, and decision approval workflow.
 */

import React, { useState, useEffect, useRef } from 'react'
import { gql, useMutation, useQuery, useSubscription } from '@apollo/client'

// GraphQL Queries
const GET_CONSCIOUSNESS_STATE = gql`
  query GetConsciousnessState {
    consciousnessState {
      state
      currentCycle
      shortTermMemory {
        summary
        importance
        timestamp
      }
      metrics {
        successRate
        avgCycleDuration
        uptimeMs
      }
    }
  }
`

const CREATE_GOAL = gql`
  mutation CreateGoal($input: CreateGoalInput!) {
    createGoal(input: $input) {
      id
      title
      type
      priority
      state
    }
  }
`

const CONSCIOUSNESS_STREAM = gql`
  subscription ConsciousnessStream {
    consciousnessStream {
      type
      data
    }
  }
`

// Types
interface Message {
  id: string
  role: 'user' | 'consciousness' | 'system'
  content: string
  timestamp: Date
}

interface ShortTermMemory {
  summary: string
  importance: number
  timestamp: string
}

interface ConsciousnessState {
  state: string
  currentCycle: number
  shortTermMemory: ShortTermMemory[]
  metrics: {
    successRate: number
    avgCycleDuration: number
    uptimeMs: number
  }
}

export const ConsciousnessChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [showGoalForm, setShowGoalForm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // GraphQL hooks
  const { data: stateData, refetch } = useQuery<{ consciousnessState: ConsciousnessState }>(
    GET_CONSCIOUSNESS_STATE,
    { pollInterval: 5000 }
  )

  const [createGoal] = useMutation(CREATE_GOAL)

  const { data: streamData } = useSubscription(CONSCIOUSNESS_STREAM)

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Add system message on mount
  useEffect(() => {
    addMessage('system', 'Connected to consciousness system. Ask me anything!')
  }, [])

  // Handle subscription updates
  useEffect(() => {
    if (streamData?.consciousnessStream) {
      const { type, data } = streamData.consciousnessStream

      if (type === 'thought') {
        addMessage('system', `💭 New thought: ${data}`)
      } else if (type === 'cycle-complete') {
        // Silent update, just refetch state
        refetch()
      }
    }
  }, [streamData, refetch])

  // Add message helper
  const addMessage = (role: Message['role'], content: string) => {
    const message: Message = {
      id: `${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, message])
  }

  // Handle user input
  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage = input.trim()
    setInput('')

    // Add user message
    addMessage('user', userMessage)

    // Check for commands
    if (userMessage.toLowerCase().startsWith('/')) {
      await handleCommand(userMessage)
      return
    }

    // Handle as question to consciousness
    await handleQuestion(userMessage)
  }

  // Handle questions
  const handleQuestion = async (question: string) => {
    try {
      const state = stateData?.consciousnessState

      if (!state) {
        addMessage('system', '❌ Unable to reach consciousness system')
        return
      }

      // Build response from current state
      let response = `**Consciousness (Cycle ${state.currentCycle})**\n\n`

      response += `**Current State:** ${state.state}\n\n`

      if (state.shortTermMemory.length > 0) {
        response += `**Recent Thoughts:**\n`
        state.shortTermMemory.slice(0, 3).forEach((mem, i) => {
          response += `${i + 1}. ${mem.summary}\n`
        })
      } else {
        response += '*No recent thoughts in short-term memory*\n'
      }

      response += `\n**Metrics:**\n`
      response += `- Success Rate: ${state.metrics.successRate.toFixed(1)}%\n`
      response += `- Avg Cycle Duration: ${state.metrics.avgCycleDuration.toFixed(0)}ms\n`
      response += `- Uptime: ${(state.metrics.uptimeMs / 1000).toFixed(1)}s\n`

      addMessage('consciousness', response)
    } catch (error) {
      addMessage('system', `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Handle commands
  const handleCommand = async (command: string) => {
    const parts = command.slice(1).split(' ')
    const cmd = parts[0].toLowerCase()

    switch (cmd) {
      case 'help':
        addMessage('system', `
**Available Commands:**

- \`/help\` - Show this help message
- \`/status\` - Show current status
- \`/goals\` - Show goal management
- \`/clear\` - Clear chat history
- \`/thoughts\` - Show recent thoughts

**Questions:**
Just type your question naturally (no slash needed).
        `.trim())
        break

      case 'status':
        await refetch()
        const state = stateData?.consciousnessState
        if (state) {
          addMessage('consciousness', `
**Status Report**

State: ${state.state}
Cycle: ${state.currentCycle}
Success Rate: ${state.metrics.successRate.toFixed(1)}%
Uptime: ${(state.metrics.uptimeMs / 1000).toFixed(1)}s
          `.trim())
        }
        break

      case 'goals':
        setShowGoalForm(true)
        addMessage('system', 'Opening goal management panel...')
        break

      case 'thoughts':
        const thoughts = stateData?.consciousnessState.shortTermMemory || []
        if (thoughts.length > 0) {
          let msg = '**Recent Thoughts:**\n\n'
          thoughts.forEach((mem, i) => {
            msg += `${i + 1}. ${mem.summary} (importance: ${mem.importance.toFixed(2)})\n`
          })
          addMessage('consciousness', msg)
        } else {
          addMessage('system', 'No thoughts in short-term memory yet.')
        }
        break

      case 'clear':
        setMessages([])
        addMessage('system', 'Chat history cleared.')
        break

      default:
        addMessage('system', `Unknown command: ${cmd}. Type /help for available commands.`)
    }
  }

  // Handle goal creation
  const handleCreateGoal = async (title: string, type: string, priority: string) => {
    try {
      const result = await createGoal({
        variables: {
          input: {
            title,
            type: type.toUpperCase(),
            priority: priority.toUpperCase()
          }
        }
      })

      const goal = result.data.createGoal
      addMessage('system', `✅ Goal created: "${goal.title}" (${goal.type}, ${goal.priority})`)
      setShowGoalForm(false)
    } catch (error) {
      addMessage('system', `❌ Failed to create goal: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Render message
  const renderMessage = (msg: Message) => {
    const roleStyles = {
      user: 'bg-blue-100 dark:bg-blue-900 ml-auto',
      consciousness: 'bg-purple-100 dark:bg-purple-900',
      system: 'bg-gray-100 dark:bg-gray-800 text-sm italic'
    }

    const roleIcons = {
      user: '👤',
      consciousness: '🧠',
      system: 'ℹ️'
    }

    return (
      <div key={msg.id} className="mb-4">
        <div className={`rounded-lg p-3 max-w-2xl ${roleStyles[msg.role]}`}>
          <div className="flex items-start gap-2">
            <span className="text-lg">{roleIcons[msg.role]}</span>
            <div className="flex-1">
              <div className="font-semibold mb-1 capitalize">{msg.role}</div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              <div className="text-xs opacity-60 mt-1">
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen max-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              🧠 Consciousness Chat
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Conversational interface to the autonomous consciousness system
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">
              {stateData?.consciousnessState.state || 'Loading...'}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              Cycle {stateData?.consciousnessState.currentCycle || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </div>

      {/* Goal Form (if shown) */}
      {showGoalForm && (
        <GoalForm
          onSubmit={handleCreateGoal}
          onCancel={() => setShowGoalForm(false)}
        />
      )}

      {/* Input */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask consciousness a question or type /help for commands..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            Send
          </button>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Type /help for commands • Use natural language for questions
        </div>
      </div>
    </div>
  )
}

// Goal Form Component
interface GoalFormProps {
  onSubmit: (title: string, type: string, priority: string) => void
  onCancel: () => void
}

const GoalForm: React.FC<GoalFormProps> = ({ onSubmit, onCancel }) => {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('improvement')
  const [priority, setPriority] = useState('medium')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim()) {
      onSubmit(title, type, priority)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Create New Goal</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="E.g., Improve test coverage"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="improvement">Improvement</option>
              <option value="investigation">Investigation</option>
              <option value="learning">Learning</option>
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-semibold"
            >
              Create Goal
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded hover:bg-gray-400 dark:hover:bg-gray-500 font-semibold"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
