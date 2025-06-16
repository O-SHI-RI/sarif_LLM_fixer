# SARIF AI Fixer

A sophisticated VS Code extension that analyzes SARIF files for MISRA-C violations and provides AI-powered fixes using OpenAI or Azure OpenAI.

## Features

- **Visual Gutter Icons**: Professional breakpoint-style warning indicators in the gutter
- **Three-Panel Layout**: Intelligent window management with source, warning list, and detail views
- **Interactive Click-to-Detail**: Click gutter icons or highlighted code to view violation details
- **AI-Powered Fixes**: Generate MISRA-C compliant code fixes using AI
- **Dual API Support**: Works with both OpenAI and Azure OpenAI APIs
- **Compact CLI Interface**: Terminal-style warning list with severity color coding

## Requirements

- VS Code 1.100.0 or higher
- Either OpenAI API access OR Azure OpenAI service deployment
- SARIF files with MISRA-C violations for analysis

## API Configuration

### Option 1: OpenAI API
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run: `SARIF AI Fixer: Configure AI API` and select "OpenAI"
3. Enter your OpenAI API key
4. Choose endpoint type:
   - **Standard OpenAI**: Use official OpenAI API endpoint
   - **Custom Endpoint**: Use corporate proxy or custom OpenAI-compatible endpoint

### Option 2: Azure OpenAI API
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run: `SARIF AI Fixer: Configure AI API` and select "Azure OpenAI"
3. Enter the following information:
   - **API Key**: Your Azure OpenAI API key
   - **Endpoint**: Your Azure OpenAI endpoint (supports corporate proxies)
     - Standard: `https://your-resource.openai.azure.com`
     - Corporate: `https://your-company-proxy.com`
   - **Deployment Name**: Your model deployment name (e.g., `gpt-4`)
   - **API Version**: API version (default: `2024-02-15-preview`)

### Environment Variable Configuration (Optional)
You can also configure via environment variables:

**For OpenAI:**
```bash
export OPENAI_API_KEY="your-openai-api-key"
```

**For Azure OpenAI:**
```bash
export AZURE_OPENAI_API_KEY="your-azure-api-key"
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
export AZURE_OPENAI_DEPLOYMENT="your-deployment-name"
export AZURE_OPENAI_API_VERSION="2024-02-15-preview"
```

### Corporate/Proxy Network Support

The extension supports corporate environments with custom endpoints and proxy configurations:

**OpenAI Custom Endpoints:**
- OpenAI-compatible APIs behind corporate proxies
- Custom domains with OpenAI API format
- Requires HTTPS endpoints ending with `/chat/completions`

**Azure OpenAI Corporate Support:**
- Works with Azure OpenAI through corporate proxies
- Flexible endpoint validation for company domains
- Supports custom subdomains and proxy configurations

**Example Corporate Configurations:**
```bash
# OpenAI through corporate proxy
export OPENAI_API_KEY="your-key"
# Configure custom endpoint via VS Code interface

# Azure OpenAI through corporate proxy  
export AZURE_OPENAI_API_KEY="your-azure-key"
export AZURE_OPENAI_ENDPOINT="https://your-company-proxy.corp.com"
export AZURE_OPENAI_DEPLOYMENT="gpt-4"
```

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
