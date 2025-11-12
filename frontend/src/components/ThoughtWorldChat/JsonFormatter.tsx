import React from 'react';
import './JsonFormatter.css';

interface JsonFormatterProps {
  content: string;
}

/**
 * Detects and formats JSON objects within text content
 */
export function JsonFormatter({ content }: JsonFormatterProps) {
  // Regex to detect JSON objects and arrays
  const jsonPattern = /\{[\s\S]*?\}|\[[\s\S]*?\]/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = jsonPattern.exec(content)) !== null) {
    const jsonString = match[0];

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(jsonString);

      // Add text before JSON
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {content.substring(lastIndex, match.index)}
          </span>
        );
      }

      // Add formatted JSON
      parts.push(
        <JsonBlock key={`json-${match.index}`} data={parsed} />
      );

      lastIndex = match.index + jsonString.length;
    } catch (e) {
      // Not valid JSON, skip it
      continue;
    }
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(
      <span key={`text-${lastIndex}`}>
        {content.substring(lastIndex)}
      </span>
    );
  }

  // If no JSON found, return original content
  if (parts.length === 0) {
    return <span>{content}</span>;
  }

  return <>{parts}</>;
}

interface JsonBlockProps {
  data: any;
}

function JsonBlock({ data }: JsonBlockProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Small objects can be displayed inline
  const jsonString = JSON.stringify(data, null, 2);
  const isSmall = jsonString.length < 100 && !jsonString.includes('\n');

  if (isSmall) {
    return (
      <span className="json-inline">
        {JSON.stringify(data)}
      </span>
    );
  }

  // Large objects get expandable display
  return (
    <div className="json-block">
      <button
        className="json-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? '▼' : '▶'} JSON {isExpanded ? '(click to collapse)' : '(click to expand)'}
      </button>
      {isExpanded && (
        <pre className="json-content">
          {jsonString}
        </pre>
      )}
    </div>
  );
}
