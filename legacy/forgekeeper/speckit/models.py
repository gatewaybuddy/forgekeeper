"""Pydantic models describing Spec-Kit documents."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SpecDoc(BaseModel):
    path: str = "spec/spec.md"
    title: str = ""
    body_md: str = ""
    invariants: list[str] = Field(default_factory=list)
    glossary: dict[str, str] = Field(default_factory=dict)
    interfaces: list[str] = Field(default_factory=list)
    inputs: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    acceptance_tests: list[str] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)
    outcome: str = ""


class PlanInterface(BaseModel):
    name: str
    description: str = ""
    path: str = "plan/interfaces.md"
    acceptance_tests: list[str] = Field(default_factory=list)
    related_tasks: list[str] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)


class PlanDoc(BaseModel):
    path: str = "plan/plan.md"
    title: str = ""
    body_md: str = ""
    invariants: list[str] = Field(default_factory=list)
    glossary: dict[str, str] = Field(default_factory=dict)
    interfaces: list[PlanInterface] = Field(default_factory=list)
    inputs: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    acceptance_tests: list[str] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)
    outcome: str = ""


class TaskDoc(BaseModel):
    path: str = "tasks/task.md"
    id: str
    title: str = ""
    body_md: str = ""
    inputs: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    acceptance_tests: list[str] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)
    outcome: str = ""


class ReviewDoc(BaseModel):
    path: str = "reviews/review.md"
    title: str = ""
    body_md: str = ""
    inputs: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    acceptance_tests: list[str] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)
    outcome: str = ""


__all__ = [
    "SpecDoc",
    "PlanInterface",
    "PlanDoc",
    "TaskDoc",
    "ReviewDoc",
]

