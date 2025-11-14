/**
 * Task Templates - Reusable task patterns for common scenarios
 *
 * Stores task templates to .forgekeeper/tasks/templates.json
 * Supports variable replacement (e.g., {component} → actual component name)
 */

import fs from 'fs/promises';
import path from 'path';
import { ulid } from 'ulid';

// Default template storage location
const TEMPLATES_DIR = process.env.TASKGEN_TEMPLATES_DIR || '.forgekeeper/tasks';
const TEMPLATES_FILE = path.join(TEMPLATES_DIR, 'templates.json');

/**
 * Ensure templates directory exists
 */
async function ensureTemplatesDir() {
  try {
    await fs.access(TEMPLATES_DIR);
  } catch {
    await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  }
}

/**
 * Built-in default templates
 */
const DEFAULT_TEMPLATES = [
  {
    id: 'template_error_spike',
    name: 'Error Spike Resolution',
    description: 'Template for handling error spikes detected by analyzers',
    taskType: 'error_spike',
    severity: 'high',
    defaultPriority: 8,
    titlePattern: 'Fix {error_type} spike in {component}',
    descriptionPattern: `An error spike has been detected in {component}.

**Error Type**: {error_type}
**Spike Magnitude**: {magnitude}x normal rate
**Time Window**: {time_window}

This requires immediate investigation and resolution.`,
    suggestedFixPattern: `1. Check recent changes to {component}
2. Review error logs for {error_type}
3. Identify root cause
4. Implement fix
5. Add tests to prevent regression
6. Monitor error rates after deployment`,
    acceptanceCriteria: [
      'Error rate returns to baseline',
      'Root cause identified and documented',
      'Fix verified in production',
      'Tests added to prevent regression',
    ],
    tags: ['error-handling', 'production-issue'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'template_docs_gap',
    name: 'Documentation Gap',
    description: 'Template for adding missing documentation',
    taskType: 'docs_gap',
    severity: 'medium',
    defaultPriority: 5,
    titlePattern: 'Document {feature} in {location}',
    descriptionPattern: `Documentation is missing for {feature}.

**Location**: {location}
**Usage Count**: {usage_count} times
**Missing Documentation**: {missing_type}

Users are encountering this feature without proper guidance.`,
    suggestedFixPattern: `1. Review {feature} implementation
2. Create comprehensive documentation covering:
   - Purpose and use cases
   - API reference
   - Code examples
   - Common pitfalls
3. Add inline code comments
4. Update README if needed
5. Link related documentation`,
    acceptanceCriteria: [
      'API documentation complete',
      'At least 2 usage examples provided',
      'Common pitfalls documented',
      'README updated if applicable',
    ],
    tags: ['documentation', 'developer-experience'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'template_performance',
    name: 'Performance Optimization',
    description: 'Template for optimizing slow operations',
    taskType: 'performance',
    severity: 'medium',
    defaultPriority: 6,
    titlePattern: 'Optimize {operation} performance',
    descriptionPattern: `Performance issue detected in {operation}.

**Current Duration**: {current_duration}ms
**Expected Duration**: {expected_duration}ms
**Slowdown Factor**: {slowdown_factor}x

This is impacting user experience and needs optimization.`,
    suggestedFixPattern: `1. Profile {operation} to identify bottlenecks
2. Consider optimizations:
   - Caching
   - Database query optimization
   - Algorithm improvements
   - Lazy loading
   - Parallel processing
3. Implement optimization
4. Add performance tests
5. Verify improvement in production`,
    acceptanceCriteria: [
      'Operation completes within expected duration',
      'Performance tests added',
      'No regression in functionality',
      'Optimization documented',
    ],
    tags: ['performance', 'optimization'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'template_ux_issue',
    name: 'UX Improvement',
    description: 'Template for fixing user experience issues',
    taskType: 'ux_issue',
    severity: 'medium',
    defaultPriority: 6,
    titlePattern: 'Fix {ux_issue} in {component}',
    descriptionPattern: `User experience issue detected in {component}.

**Issue Type**: {ux_issue}
**User Impact**: {impact_description}
**Abort Rate**: {abort_rate}%

Users are experiencing friction that needs to be resolved.`,
    suggestedFixPattern: `1. Reproduce the UX issue
2. Identify root cause
3. Design improved user flow
4. Implement UX improvements:
   - Better error messages
   - Loading indicators
   - Input validation
   - Helpful tooltips
5. Test with real users
6. Monitor abort rates after deployment`,
    acceptanceCriteria: [
      'Issue no longer reproducible',
      'Abort rate reduced by at least 50%',
      'User feedback positive',
      'Edge cases handled gracefully',
    ],
    tags: ['ux', 'user-experience'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'template_continuation',
    name: 'Continuation Fix',
    description: 'Template for resolving incomplete response issues',
    taskType: 'continuation',
    severity: 'high',
    defaultPriority: 7,
    titlePattern: 'Fix continuation issues in {endpoint}',
    descriptionPattern: `Incomplete responses detected in {endpoint}.

**Continuation Rate**: {continuation_rate}%
**Affected Users**: {affected_count}

Responses are being truncated, impacting user experience.`,
    suggestedFixPattern: `1. Review response size limits
2. Check for:
   - Token limits
   - Timeout issues
   - Memory constraints
   - Network issues
3. Implement fixes:
   - Pagination
   - Streaming responses
   - Response compression
   - Optimize payload size
4. Add monitoring for continuation rates
5. Verify fix in production`,
    acceptanceCriteria: [
      'Continuation rate below 5%',
      'All responses complete',
      'No timeout errors',
      'Monitoring in place',
    ],
    tags: ['api', 'reliability'],
    createdAt: new Date().toISOString(),
  },
];

/**
 * Load all templates from storage
 *
 * @returns {Promise<Array>} Array of templates
 */
export async function loadTemplates() {
  try {
    await fs.access(TEMPLATES_FILE);
    const content = await fs.readFile(TEMPLATES_FILE, 'utf-8');
    const templates = JSON.parse(content);
    return templates;
  } catch {
    // File doesn't exist, return default templates
    return DEFAULT_TEMPLATES;
  }
}

/**
 * Save templates to storage
 *
 * @param {Array} templates - Templates to save
 * @returns {Promise<void>}
 */
async function saveTemplates(templates) {
  await ensureTemplatesDir();
  const content = JSON.stringify(templates, null, 2);
  await fs.writeFile(TEMPLATES_FILE, content, 'utf-8');
}

/**
 * Get a single template by ID
 *
 * @param {string} templateId - Template ID
 * @returns {Promise<Object|null>} Template or null if not found
 */
export async function getTemplate(templateId) {
  const templates = await loadTemplates();
  return templates.find(t => t.id === templateId) || null;
}

/**
 * Create a new template
 *
 * @param {Object} template - Template data
 * @returns {Promise<Object>} Created template
 */
export async function createTemplate(template) {
  const templates = await loadTemplates();

  // Validate required fields
  if (!template.name || !template.taskType) {
    throw new Error('Template must have name and taskType');
  }

  // Create template with ID and timestamp
  const newTemplate = {
    id: ulid(),
    ...template,
    createdAt: new Date().toISOString(),
  };

  templates.push(newTemplate);
  await saveTemplates(templates);

  return newTemplate;
}

/**
 * Update an existing template
 *
 * @param {string} templateId - Template ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated template or null if not found
 */
export async function updateTemplate(templateId, updates) {
  const templates = await loadTemplates();
  const index = templates.findIndex(t => t.id === templateId);

  if (index === -1) {
    return null;
  }

  // Prevent updating built-in template IDs
  if (templates[index].id.startsWith('template_')) {
    throw new Error('Cannot update built-in templates');
  }

  // Update template
  templates[index] = {
    ...templates[index],
    ...updates,
    id: templateId, // Preserve ID
    updatedAt: new Date().toISOString(),
  };

  await saveTemplates(templates);
  return templates[index];
}

/**
 * Delete a template
 *
 * @param {string} templateId - Template ID
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
export async function deleteTemplate(templateId) {
  const templates = await loadTemplates();

  // Prevent deleting built-in templates
  if (templateId.startsWith('template_')) {
    throw new Error('Cannot delete built-in templates');
  }

  const filteredTemplates = templates.filter(t => t.id !== templateId);

  if (filteredTemplates.length === templates.length) {
    return false; // Template not found
  }

  await saveTemplates(filteredTemplates);
  return true;
}

/**
 * Replace variables in a template string
 *
 * @param {string} template - Template string with {variable} placeholders
 * @param {Object} variables - Variable values
 * @returns {string} String with variables replaced
 */
function replaceVariables(template, variables) {
  if (!template) return '';

  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, value || `{${key}}`);
  }
  return result;
}

/**
 * Create a task from a template
 *
 * @param {string} templateId - Template ID
 * @param {Object} variables - Variable values to replace in template
 * @returns {Promise<Object>} Task card created from template
 */
export async function createTaskFromTemplate(templateId, variables = {}) {
  const template = await getTemplate(templateId);

  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  // Create task from template with variable replacement
  const task = {
    id: ulid(),
    type: template.taskType,
    severity: template.severity,
    status: 'generated',
    title: replaceVariables(template.titlePattern, variables),
    description: replaceVariables(template.descriptionPattern, variables),
    priority: template.defaultPriority,
    confidence: 1.0, // Templates are user-created, so high confidence
    generatedAt: new Date().toISOString(),
    analyzer: 'template',
    evidence: {
      summary: `Created from template: ${template.name}`,
      details: ['Task created manually from template'],
      template: {
        id: template.id,
        name: template.name,
        variables,
      },
    },
    suggestedFix: template.suggestedFixPattern
      ? {
          summary: 'Suggested fix from template',
          steps: replaceVariables(template.suggestedFixPattern, variables).split('\n'),
        }
      : undefined,
    acceptanceCriteria: template.acceptanceCriteria || [],
    tags: template.tags || [],
  };

  return task;
}

export default {
  loadTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createTaskFromTemplate,
};
