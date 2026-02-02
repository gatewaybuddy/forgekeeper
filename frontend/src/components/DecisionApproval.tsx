/**
 * Decision Approval Workflow Component
 *
 * Human-in-the-loop decision approval for consciousness system.
 * Allows users to review, approve, or reject decisions with feedback.
 */

import React, { useState, useEffect } from 'react'
import { gql, useMutation, useQuery } from '@apollo/client'

// GraphQL Queries
const ANALYZE_DECISION = gql`
  mutation AnalyzeDecision($input: DecisionInput!) {
    analyzeDecision(input: $input) {
      recommendation {
        chosenOption
        confidence
        reasoning {
          point
          type
        }
        alternatives {
          option
          score
          reasoning
        }
      }
    }
  }
`

const GET_PENDING_DECISIONS = gql`
  query GetPendingDecisions {
    pendingDecisions {
      id
      question
      options {
        name
        description
        expectedValue
        risk
        effort
      }
      status
      createdAt
      recommendation {
        chosenOption
        confidence
      }
    }
  }
`

// Types
interface DecisionOption {
  name: string
  description: string
  expectedValue: number
  risk: number
  effort: number
}

interface ReasoningPoint {
  point: string
  type: 'pro' | 'con' | 'consideration'
}

interface Alternative {
  option: string
  score: number
  reasoning: string
}

interface Recommendation {
  chosenOption: string
  confidence: number
  reasoning: ReasoningPoint[]
  alternatives: Alternative[]
}

interface Decision {
  id: string
  question: string
  options: DecisionOption[]
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  recommendation?: Recommendation
}

interface DecisionApprovalProps {
  onApprove?: (decision: Decision) => void
  onReject?: (decision: Decision, feedback: string) => void
}

export const DecisionApproval: React.FC<DecisionApprovalProps> = ({
  onApprove,
  onReject
}) => {
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null)
  const [feedback, setFeedback] = useState('')
  const [customQuestion, setCustomQuestion] = useState('')
  const [customOptions, setCustomOptions] = useState<DecisionOption[]>([])
  const [showNewDecision, setShowNewDecision] = useState(false)

  const { data, refetch } = useQuery<{ pendingDecisions: Decision[] }>(
    GET_PENDING_DECISIONS,
    { pollInterval: 10000 }
  )

  const [analyzeDecision, { loading: analyzing }] = useMutation(ANALYZE_DECISION)

  // Handle approve
  const handleApprove = (decision: Decision) => {
    if (onApprove) {
      onApprove(decision)
    }
    setSelectedDecision(null)
    refetch()
  }

  // Handle reject
  const handleReject = (decision: Decision) => {
    if (onReject) {
      onReject(decision, feedback)
    }
    setFeedback('')
    setSelectedDecision(null)
    refetch()
  }

  // Handle new decision creation
  const handleCreateDecision = async () => {
    if (!customQuestion || customOptions.length < 2) {
      alert('Please provide a question and at least 2 options')
      return
    }

    try {
      const result = await analyzeDecision({
        variables: {
          input: {
            question: customQuestion,
            options: customOptions,
            goals: []
          }
        }
      })

      // Add to pending decisions
      const newDecision: Decision = {
        id: `custom-${Date.now()}`,
        question: customQuestion,
        options: customOptions,
        status: 'pending',
        createdAt: new Date().toISOString(),
        recommendation: result.data.analyzeDecision.recommendation
      }

      setSelectedDecision(newDecision)
      setShowNewDecision(false)
      setCustomQuestion('')
      setCustomOptions([])
    } catch (error) {
      alert(`Failed to analyze decision: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Render decision card
  const renderDecisionCard = (decision: Decision) => {
    const isSelected = selectedDecision?.id === decision.id

    return (
      <div
        key={decision.id}
        className={`border rounded-lg p-4 cursor-pointer transition-all ${
          isSelected
            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-700'
        }`}
        onClick={() => setSelectedDecision(isSelected ? null : decision)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-2">{decision.question}</h3>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {decision.options.length} options • {new Date(decision.createdAt).toLocaleString()}
            </div>
            {decision.recommendation && (
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200 rounded text-sm font-semibold">
                  Recommended: {decision.recommendation.chosenOption}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Confidence: {(decision.recommendation.confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
          <div className={`px-3 py-1 rounded text-sm font-semibold ${
            decision.status === 'pending'
              ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
              : decision.status === 'approved'
              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
              : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
          }`}>
            {decision.status}
          </div>
        </div>
      </div>
    )
  }

  // Render decision details
  const renderDecisionDetails = (decision: Decision) => {
    const rec = decision.recommendation

    return (
      <div className="border border-purple-300 dark:border-purple-700 rounded-lg p-6 bg-white dark:bg-gray-800">
        <h2 className="text-2xl font-bold mb-4">{decision.question}</h2>

        {/* Options */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Options</h3>
          <div className="space-y-3">
            {decision.options.map((opt, i) => (
              <div
                key={i}
                className={`border rounded p-3 ${
                  rec?.chosenOption === opt.name
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-semibold">{opt.name}</div>
                  {rec?.chosenOption === opt.name && (
                    <span className="px-2 py-1 bg-purple-600 text-white rounded text-xs font-semibold">
                      RECOMMENDED
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {opt.description}
                </div>
                <div className="flex gap-4 text-xs">
                  <div>
                    <span className="font-semibold">Value:</span>{' '}
                    <span className="text-green-600 dark:text-green-400">
                      {(opt.expectedValue * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold">Risk:</span>{' '}
                    <span className="text-red-600 dark:text-red-400">
                      {(opt.risk * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold">Effort:</span>{' '}
                    <span className="text-blue-600 dark:text-blue-400">
                      {(opt.effort * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reasoning */}
        {rec && rec.reasoning.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Reasoning</h3>
            <div className="space-y-2">
              {rec.reasoning.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-2 rounded ${
                    r.type === 'pro'
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : r.type === 'con'
                      ? 'bg-red-50 dark:bg-red-900/20'
                      : 'bg-gray-50 dark:bg-gray-800'
                  }`}
                >
                  <span className="font-bold">
                    {r.type === 'pro' ? '✓' : r.type === 'con' ? '✗' : '•'}
                  </span>
                  <span className="text-sm">{r.point}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alternatives */}
        {rec && rec.alternatives && rec.alternatives.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Alternative Analysis</h3>
            <div className="space-y-2">
              {rec.alternatives.map((alt, i) => (
                <div key={i} className="border border-gray-300 dark:border-gray-600 rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold">{alt.option}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Score: {(alt.score * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {alt.reasoning}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confidence */}
        {rec && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Confidence</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                <div
                  className="bg-purple-600 h-4 rounded-full transition-all"
                  style={{ width: `${rec.confidence * 100}%` }}
                />
              </div>
              <div className="font-bold">{(rec.confidence * 100).toFixed(0)}%</div>
            </div>
          </div>
        )}

        {/* Actions */}
        {decision.status === 'pending' && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <button
                onClick={() => handleApprove(decision)}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
              >
                ✓ Approve Decision
              </button>
              <button
                onClick={() => setFeedback('')}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
              >
                ✗ Reject Decision
              </button>
            </div>

            {feedback !== null && feedback !== undefined && (
              <div className="border border-gray-300 dark:border-gray-600 rounded p-3">
                <label className="block text-sm font-semibold mb-2">
                  Rejection Feedback (Optional)
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Explain why you're rejecting this decision..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
                  rows={3}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleReject(decision)}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold"
                  >
                    Submit Rejection
                  </button>
                  <button
                    onClick={() => setFeedback('')}
                    className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const pendingDecisions = data?.pendingDecisions || []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">Decision Approval</h1>
          <button
            onClick={() => setShowNewDecision(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold"
          >
            + New Decision
          </button>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Review and approve decisions from the consciousness system
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4">
          <div className="text-2xl font-bold">
            {pendingDecisions.filter(d => d.status === 'pending').length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Pending</div>
        </div>
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {pendingDecisions.filter(d => d.status === 'approved').length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Approved</div>
        </div>
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {pendingDecisions.filter(d => d.status === 'rejected').length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Rejected</div>
        </div>
      </div>

      {/* Decision List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">Pending Decisions</h2>
          {pendingDecisions.length === 0 ? (
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
              No pending decisions
            </div>
          ) : (
            <div className="space-y-3">
              {pendingDecisions.map(renderDecisionCard)}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Details</h2>
          {selectedDecision ? (
            renderDecisionDetails(selectedDecision)
          ) : (
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
              Select a decision to view details
            </div>
          )}
        </div>
      </div>

      {/* New Decision Modal */}
      {showNewDecision && (
        <NewDecisionModal
          question={customQuestion}
          options={customOptions}
          analyzing={analyzing}
          onQuestionChange={setCustomQuestion}
          onOptionsChange={setCustomOptions}
          onCreate={handleCreateDecision}
          onCancel={() => {
            setShowNewDecision(false)
            setCustomQuestion('')
            setCustomOptions([])
          }}
        />
      )}
    </div>
  )
}

// New Decision Modal
interface NewDecisionModalProps {
  question: string
  options: DecisionOption[]
  analyzing: boolean
  onQuestionChange: (q: string) => void
  onOptionsChange: (opts: DecisionOption[]) => void
  onCreate: () => void
  onCancel: () => void
}

const NewDecisionModal: React.FC<NewDecisionModalProps> = ({
  question,
  options,
  analyzing,
  onQuestionChange,
  onOptionsChange,
  onCreate,
  onCancel
}) => {
  const [newOption, setNewOption] = useState<DecisionOption>({
    name: '',
    description: '',
    expectedValue: 0.5,
    risk: 0.3,
    effort: 0.5
  })

  const addOption = () => {
    if (newOption.name && newOption.description) {
      onOptionsChange([...options, newOption])
      setNewOption({
        name: '',
        description: '',
        expectedValue: 0.5,
        risk: 0.3,
        effort: 0.5
      })
    }
  }

  const removeOption = (index: number) => {
    onOptionsChange(options.filter((_, i) => i !== index))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Create New Decision</h2>

        {/* Question */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">Decision Question</label>
          <input
            type="text"
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            placeholder="E.g., Should we migrate to TypeScript?"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* Options */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2">
            Options ({options.length})
          </label>

          {/* Existing options */}
          {options.map((opt, i) => (
            <div key={i} className="border border-gray-300 dark:border-gray-600 rounded p-3 mb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-semibold">{opt.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{opt.description}</div>
                  <div className="flex gap-4 text-xs mt-1">
                    <span>Value: {(opt.expectedValue * 100).toFixed(0)}%</span>
                    <span>Risk: {(opt.risk * 100).toFixed(0)}%</span>
                    <span>Effort: {(opt.effort * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <button
                  onClick={() => removeOption(i)}
                  className="text-red-600 hover:text-red-700"
                >
                  ✗
                </button>
              </div>
            </div>
          ))}

          {/* Add option form */}
          <div className="border border-dashed border-gray-400 dark:border-gray-600 rounded p-3">
            <input
              type="text"
              value={newOption.name}
              onChange={(e) => setNewOption({ ...newOption, name: e.target.value })}
              placeholder="Option name"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
            />
            <textarea
              value={newOption.description}
              onChange={(e) => setNewOption({ ...newOption, description: e.target.value })}
              placeholder="Description"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
              rows={2}
            />
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div>
                <label className="text-xs">Expected Value</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={newOption.expectedValue}
                  onChange={(e) =>
                    setNewOption({ ...newOption, expectedValue: parseFloat(e.target.value) })
                  }
                  className="w-full"
                />
                <div className="text-xs text-center">
                  {(newOption.expectedValue * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <label className="text-xs">Risk</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={newOption.risk}
                  onChange={(e) =>
                    setNewOption({ ...newOption, risk: parseFloat(e.target.value) })
                  }
                  className="w-full"
                />
                <div className="text-xs text-center">{(newOption.risk * 100).toFixed(0)}%</div>
              </div>
              <div>
                <label className="text-xs">Effort</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={newOption.effort}
                  onChange={(e) =>
                    setNewOption({ ...newOption, effort: parseFloat(e.target.value) })
                  }
                  className="w-full"
                />
                <div className="text-xs text-center">{(newOption.effort * 100).toFixed(0)}%</div>
              </div>
            </div>
            <button
              onClick={addOption}
              disabled={!newOption.name || !newOption.description}
              className="w-full px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Option
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onCreate}
            disabled={!question || options.length < 2 || analyzing}
            className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            {analyzing ? 'Analyzing...' : 'Analyze Decision'}
          </button>
          <button
            onClick={onCancel}
            disabled={analyzing}
            className="flex-1 px-6 py-3 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
