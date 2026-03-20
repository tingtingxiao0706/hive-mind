---
name: list-skills
description: List all available skills with their descriptions and capabilities
metadata:
  category: utility
  tags: [meta, discovery, help]
---

# List Skills

When the user asks to list or discover available skills, provide a formatted overview of all registered skills.

## Instructions

1. Present skills in a clear, organized format
2. Include the skill name, description, and whether it has scripts
3. Group skills by category if metadata.category is available
4. Highlight agent-capable skills (x-hive.agent: true)

## Output Format

For each skill, show:
- **Name**: The skill identifier
- **Description**: What the skill does
- **Type**: Pure instruction / Script-enabled / Agent
- **Category**: From metadata if available
