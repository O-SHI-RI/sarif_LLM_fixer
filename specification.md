# SARIF-AI-FIXER

## Requirements
- The SARIF-AI-FIXER is a tool designed to analyze SARIF (Static Analysis Results Interchange Format) files and provide AI-generated fixes for issues reported in the SARIF logs. It aims to enhance the usability of SARIF by integrating AI capabilities to suggest actionable fixes.

## Specification
- The tool should be able to read SARIF files and parse the issues reported within them.
- From the parsed issues, the tool should identify the violations of MISRA-C rules and its regions on each code line.
- The tool should refer to the MISRA-C guidelines stored in the `misra-c.json` file to understand the rules and their descriptions.
- The tool should generate AI-based suggestions for fixing the identified issues referencing the MISRA-C rules in the `misra-c.json` file
- The tool should put violated codes, the corresponding MISRA-C rule, its remediation sample, in the prompts that asking for AI-generated fixes via the OpenAI API.
- The tool should handle the OpenAI API responses and show the AI-generated fixes in code format highlighting the changes made.
- The tool should provide a user-friendly interface to display AI-generated fixes alongside the original code and the identified issues.
- The tool should allow users to review the AI-generated fixes and apply them to the original code if desired via buttons or similar UI elements.