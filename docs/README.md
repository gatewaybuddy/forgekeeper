# Forgekeeper Documentation Index

This index orients contributors to the documentation tree. Each section links to the most relevant subdirectories and living documents.

---

## 📚 Getting Started

**New to Forgekeeper?** Start here:

- **[Quickstart Guide](../QUICKSTART.md)** - 10-minute path to your first contribution
- [Contributing Guide](../CONTRIBUTING.md) - Comprehensive contribution workflow
- [README](../README.md) - Project overview and installation
- [Configuration Guide](guides/CONFIG_QUICKSTART.md) - vLLM configuration options
- [Autonomous Mode](autonomous/README.md) - Get started with autonomous agents

**Feature Guides:**
- **[TGT User Guide](guides/TGT_USER_GUIDE.md)** - Telemetry-Driven Task Generation with examples
- [SAPL User Guide](guides/SAPL_USER_GUIDE.md) - Safe Auto-PR Loop (coming soon)

---

## 🏗️ Architecture

Learn about Forgekeeper's design and architecture:

- **[CLAUDE.md](../CLAUDE.md)** - Complete architecture guide (three-layer system, tool orchestration, ContextLog, etc.)
- [Frontend Analysis](../FRONTEND_ANALYSIS.md) - Deep dive into frontend architecture
- **[ADRs (Architecture Decision Records)](#-architecture-decision-records)** - Key architectural decisions

---

## 🤖 Autonomous Agent

Documentation for the autonomous agent system:

- **[Autonomous Agent Overview](autonomous/README.md)** - Introduction to autonomous mode
- **[Autonomous Quick Start](autonomous/quick_start.md)** - Quick-start checklist for running the autonomous stack
- **[Agent Capabilities](../AUTONOMOUS_AGENT_CAPABILITIES_2025-11-02.md)** - What the agent can do (48+ task patterns, 16 categories)
- **[Phases](autonomous/phases/)** - Phase-by-phase implementation history (Phase 1-7)
  - [Phase 1: Recursive Feedback](../PHASE1_RECURSIVE_FEEDBACK_COMPLETE.md)
  - [Phase 2: Meta-Cognition](../PHASE2_META_COGNITION_COMPLETE.md)
  - [Phase 3: Cross-Session Learning](../PHASE3_CROSS_SESSION_LEARNING_COMPLETE.md)
  - [Phase 4: Enhanced Progress Tracking](../PHASE4_COMPLETE_SUMMARY.md)
  - [Phase 5: User Preferences](PHASE5_USER_PREFERENCE_LEARNING.md) + [Episodic Memory](PHASE5_EPISODIC_MEMORY.md)
  - [Phase 6: Proactive Planning](autonomous/PHASE6_COMPLETE.md)
  - [Phase 7: Pattern Learning](autonomous/PHASE7_COMPLETE.md)
- **[TGT (Telemetry-Driven Task Generation)](autonomous/tgt/)** - Automatic task detection from telemetry
  - **[TGT User Guide](guides/TGT_USER_GUIDE.md)** - How to use TGT with examples
- **[Diagnostic Reflection](autonomous/diagnostic-reflection/)** - Error recovery and "5 Whys" analysis
- **[History](autonomous/history/)** - Historical phase completion reports and automation retrospectives

---

## 📖 Architecture Decision Records

Key architectural decisions documented:

- [ADR-0001: ContextLog](contextlog/adr-0001-contextlog.md) - JSONL-backed event logging
- [ADR-0002: Self-Review and Chunked Reasoning](adr-0002-self-review-and-chunked-reasoning.md)
- [ADR-0003: Diagnostic Reflection](adr-0003-diagnostic-reflection.md) - "5 Whys" error analysis
- [ADR-0004: Intelligent Task Planning](adr-0004-intelligent-task-planning.md)

---

## 📋 Planning Hub

- [`planning/`](planning/): Roadmap, sprint plan, self-improvement priorities, and the active session log
- [`planning/README.md`](planning/README.md): Entry point explaining how planning artifacts connect and where to log updates
- **[ROADMAP.md](../ROADMAP.md)** - Project roadmap and priorities
- **[tasks.md](../tasks.md)** - Active task tracking (comprehensive)
- [Self-Improvement Plan](roadmap/self_improvement_plan.md) - TGT → SAPL → MIP strategy

---

## 📐 Policies & Guardrails

- [`policies/guardrails.md`](policies/guardrails.md): Canonical delivery guardrails for all contributors
- [Security Policy](security/redaction_policy.md): Redaction and security policies

---

## 🛠️ Development

Guides for contributors and developers:

- [Self-Improvement Workflow](../SELF_IMPROVEMENT_WORKFLOW.md) - How the agent improves itself
- [Testing Documentation](testing/) - Testing strategy and guides (TBD)
- [Week-by-Week Progress](#-weekly-progress) - Implementation timeline

---

## 🔧 API Reference

API endpoint documentation:

- [Chat Stream API](api/chat_stream.md) - Streaming chat endpoint
- [Autonomous API](autonomous/) - Autonomous agent endpoints
- [ContextLog API](contextlog/) - Event log access

---

## 🎨 UI Components

UI component specifications:

- [Diagnostics Drawer](ui/diagnostics_drawer.md)
- [Status Bar](ui/status_bar.md)
- [Stop & Revise](ui/stop_and_revise.md)
- [SAPL (Safe Auto-PR)](ui/sapl.md)
- [New Conversation](ui/new_conversation.md)
- [Polling](ui/polling.md)

---

## 🐛 Troubleshooting

Having issues? Check these guides:

- [GPT-OSS Issues Diagnosis](../DIAGNOSIS_GPT_OSS_ISSUES.md)
- [Switch to vLLM Guide](../SWITCH_TO_VLLM.md)

---

## 📊 Testing & Performance

Documentation for testing and optimization:

- [Performance Optimizations](PERFORMANCE_OPTIMIZATIONS.md) - Week 9 100-500x speedups
- [Week 8: TGT Enhancements](WEEK_8_TGT_ENHANCEMENTS.md)
- [Week 9: Smart Task Management](WEEK_9_SMART_TASK_MANAGEMENT.md)
- [Autonomous Tests Analysis](../AUTONOMOUS_TESTS_ANALYSIS.md)

---

## 📅 Weekly Progress

Track implementation progress week by week:

- [Week 8: TGT Enhancements](WEEK_8_TGT_ENHANCEMENTS.md)
- [Week 9: Smart Task Management](WEEK_9_SMART_TASK_MANAGEMENT.md)
- Week 10: TBD

---

## 🔐 Security

Security-related documentation:

- [`security/`](security/): Security policies, threat models, and reviews
- [Redaction Policy](security/redaction_policy.md)

---

## 📦 Integrations

Third-party integrations:

- [Spec-Kit Integration](integrations/spec-kit.md)
- [Codex Integration](codex/)

---

## 📦 Specialized Areas

- [`multi_role_pipeline/`](multi_role_pipeline/): Role-specific plans and deliverables (legacy - consider archiving)
- [`contextlog/`](contextlog/): Event logging specifications and examples
- [`plans/`](plans/): Machine-readable plan sources (YAML/JSON) used to generate Markdown views

---

## 📁 Archive

Legacy or Archived References:

- [`autonomous/history/`](autonomous/history/): Historical reports migrated from the repository root
- Additional archive material remains under `archive/` (if present) and should be referenced from planning documents before use

---

## 📝 Recent Updates

- **2025-11-04**: Documentation reorganization (Priority 1 cleanup)
- **2025-11-04**: Week 8-9 test fixes (22/22 passing)
- **2025-11-03**: vLLM optimization complete (Phase 8)
- **2025-11-02**: Autonomous agent capabilities documented (48+ patterns)

---

## 🆘 Need Help?

1. **Start with [README.md](../README.md)** for basic setup
2. **Check [CLAUDE.md](../CLAUDE.md)** for architecture overview
3. **Search [tasks.md](../tasks.md)** for specific feature status
4. **Review [ROADMAP.md](../ROADMAP.md)** for future plans
5. **Ask in GitHub Issues** if you can't find what you need

---

**Note for Contributors**: When introducing new top-level folders or moving major artifacts, update this index so future readers can locate them quickly.

**Last Updated**: 2025-11-04
