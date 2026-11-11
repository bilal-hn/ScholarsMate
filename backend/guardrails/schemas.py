from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class RailAction(str, Enum):
    ALLOW = "ALLOW"
    MODIFY = "MODIFY"
    BLOCK = "BLOCK"


class Violation(BaseModel):
    rail_name: str
    severity: str = "medium"  # low, medium, high, critical
    message: str


class GuardrailResult(BaseModel):
    action: RailAction = RailAction.ALLOW
    sanitized_text: str = ""
    violations: List[Violation] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Supports backward and forward compatible dictionary serialization."""
        if hasattr(self, "model_dump"):
            return self.model_dump()
        return self.dict()
