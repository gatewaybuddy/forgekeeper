import React from 'react';
import { ToolExecution } from './types';
import './ToolFormatter.css';

interface ToolFormatterProps {
  toolExecution: ToolExecution;
}

// Icon mapping for common tools
const toolIcons: Record<string, string> = {
  read_file: '📄',
  write_file: '✍️',
  read_dir: '📁',
  run_bash: '⚡',
  run_powershell: '💻',
  get_time: '🕐',
  echo: '💬',
  http_get: '🌐',
  http_post: '📤',
  search_files: '🔍',
  default: '🔧'
};

const getToolIcon = (toolName: string): string => {
  return toolIcons[toolName] || toolIcons.default;
};

const formatArgValue = (value: unknown): string => {
  if (typeof value === 'string') {
    // Truncate long strings
    return value.length > 100 ? `${value.substring(0, 100)}...` : value;
  }
  if (typeof value === 'boolean') {
    return value ? '✓' : '✗';
  }
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
};

const formatResult = (result: unknown): React.ReactNode => {
  if (typeof result === 'string') {
    // Check if it's file content or directory listing
    if (result.includes('\n') && result.length > 200) {
      return (
        <details className="result-expandable">
          <summary>View output ({result.split('\n').length} lines)</summary>
          <pre>{result}</pre>
        </details>
      );
    }
    return <pre>{result}</pre>;
  }

  if (Array.isArray(result)) {
    return (
      <div className="result-array">
        {result.map((item, index) => (
          <div key={index} className="array-item">
            {typeof item === 'string' ? item : JSON.stringify(item)}
          </div>
        ))}
      </div>
    );
  }

  if (typeof result === 'object' && result !== null) {
    return <pre>{JSON.stringify(result, null, 2)}</pre>;
  }

  return <span>{String(result)}</span>;
};

export function ToolFormatter({ toolExecution }: ToolFormatterProps) {
  const { tool, arguments: args, result, success, error, elapsed } = toolExecution;
  const icon = getToolIcon(tool);

  return (
    <div className={`tool-execution ${success === false ? 'error' : success === true ? 'success' : 'pending'}`}>
      <div className="tool-header">
        <span className="tool-icon">{icon}</span>
        <div className="tool-info">
          <span className="tool-name">{tool}</span>
          {elapsed && (
            <span className="tool-elapsed">{(elapsed / 1000).toFixed(2)}s</span>
          )}
        </div>
        {success === true && <span className="status-badge success">✓ Success</span>}
        {success === false && <span className="status-badge error">✗ Failed</span>}
        {success === undefined && <span className="status-badge pending">⏳ Running...</span>}
      </div>

      {args && Object.keys(args).length > 0 && (
        <div className="tool-arguments">
          <div className="section-label">Arguments:</div>
          <div className="arguments-grid">
            {Object.entries(args).map(([key, value]) => (
              <div key={key} className="argument-row">
                <span className="arg-key">{key}:</span>
                <span className="arg-value">{formatArgValue(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="tool-error">
          <div className="section-label">Error:</div>
          <div className="error-message">{error}</div>
        </div>
      )}

      {result && success && (
        <div className="tool-result">
          <div className="section-label">Result:</div>
          <div className="result-content">
            {formatResult(result)}
          </div>
        </div>
      )}
    </div>
  );
}
