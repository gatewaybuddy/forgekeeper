# Forgekeeper Skills

This directory contains **Skills** - modular, reusable capabilities that Claude autonomously invokes to complete tasks.

## What are Skills?

Skills are:
- **Model-invoked**: Claude decides when to use them based on the task
- **Modular**: Each skill is self-contained with clear instructions
- **Reusable**: Once created, skills work across all conversations
- **Shareable**: Project skills (here) are checked into git for team use

## Skill Locations

- **Project Skills**: `.claude/skills/` (this directory) - Shared with team, checked into git
- **Personal Skills**: `~/.claude/skills/` - Available across all your projects

## How Skills Work

1. Claude scans available skills when working on tasks
2. If a skill matches the current task, Claude loads it
3. Claude follows the skill's instructions to complete the task
4. Skill usage is logged to ContextLog for transparency

## Creating a Skill

1. Copy the `TEMPLATE/` directory:
   ```bash
   cp -r TEMPLATE/ my-skill/
   ```

2. Edit `my-skill/SKILL.md`:
   - Update YAML frontmatter (name, description, tags)
   - Write clear instructions
   - Add examples and error handling

3. Test the skill:
   - Ask Claude to perform a task that should trigger the skill
   - Verify skill is invoked and produces expected results

4. Commit to git (for project skills):
   ```bash
   git add .claude/skills/my-skill/
   git commit -m "feat: Add my-skill for [purpose]"
   ```

## Skill Structure

```
my-skill/
├── SKILL.md              # Skill definition (required)
├── scripts/              # Helper scripts (optional)
│   └── helper.sh
├── templates/            # Templates (optional)
│   └── config.yaml
└── examples/             # Examples (optional)
    └── sample.txt
```

## Available Skills

### Current Skills
(Skills will be listed here as they are created)

- `TEMPLATE/` - Template for creating new skills

### Planned Skills

**Testing**:
- `testing/unit` - Unit test generation
- `testing/integration` - Integration test creation
- `testing/e2e` - E2E test workflows

**Documentation**:
- `docs/api` - API documentation generation
- `docs/readme` - README.md creation
- `docs/adr` - Architecture decision records

**Code Quality**:
- `quality/refactor` - Code refactoring patterns
- `quality/review` - Code review checklists
- `quality/security` - Security audit

**Deployment**:
- `deploy/docker` - Docker containerization
- `deploy/ci` - CI/CD pipeline setup
- `deploy/kubernetes` - K8s deployment

**Forgekeeper**:
- `forgekeeper/task-card` - Task card creation
- `forgekeeper/autonomous` - Autonomous mode workflows
- `forgekeeper/phase8` - Approval workflows

## Best Practices

1. **Clear Descriptions**: Make skill descriptions specific so Claude knows when to use them
2. **Step-by-Step Instructions**: Break down complex tasks into clear steps
3. **Error Handling**: Document common issues and fixes
4. **Examples**: Provide concrete examples of skill usage
5. **Tags**: Use descriptive tags for better discoverability
6. **Version**: Increment version number when making significant changes

## Troubleshooting

### Skill Not Being Invoked
- Check that `SKILL.md` exists and is properly formatted
- Ensure YAML frontmatter is valid
- Verify description matches the task type
- Add more specific tags

### Skill Instructions Unclear
- Add more detailed step-by-step instructions
- Include code examples or commands
- Add common error scenarios

### Skill Conflicts
- Make skill descriptions more specific
- Use unique tags to differentiate similar skills
- Disable unused skills by adding `enabled: false` to frontmatter

## Resources

- [Capability Expansion Plan](../../docs/planning/CAPABILITY_EXPANSION_PLAN.md)
- [Skills Integration Plan](../../docs/planning/CAPABILITY_EXPANSION_PLAN.md#-skills-system-integration-plan)
- [Anthropic Skills Documentation](https://code.claude.com/docs/en/skills)

## Contributing

We welcome skill contributions! To contribute:

1. Create your skill following the template
2. Test thoroughly in your local environment
3. Document all prerequisites and examples
4. Submit a PR with clear description of skill purpose

## License

Skills in this directory are part of the Forgekeeper project and follow the project's license.
