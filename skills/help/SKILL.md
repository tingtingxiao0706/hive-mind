---
name: help
description: Provide help and usage guidance for the Hive-Mind skill system
metadata:
  category: utility
  tags: [help, guide, documentation]
---

# Help

Provide guidance on how to use the Hive-Mind skill system.

## Topics

### How Skills Work
- Skills are loaded progressively to minimize context usage
- Each skill provides specialized instructions and optionally executable scripts
- Skills are matched to your request automatically via keyword routing

### Using Scripts
- Some skills include scripts in their `scripts/` directory
- Scripts are executed safely within security boundaries
- You can use `run_script` to execute a skill's script
- Use `list_skill_files` to see available scripts

### Workspace Isolation
- Different workspaces can have different skill sets and configurations
- Each workspace can have its own model preferences and security settings

### Tips
- Be specific in your requests for better skill matching
- You can explicitly specify skills: `skills: ['skill-name']`
- Use streaming for real-time output during long operations
