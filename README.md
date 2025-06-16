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

## Package Information

### Runtime Dependencies
- **axios** `^1.9.0` - HTTP client for AI API communication

### Development Dependencies
- **@types/mocha** `^10.0.10` - TypeScript definitions for Mocha testing framework
- **@types/node** `20.x` - TypeScript definitions for Node.js
- **@types/vscode** `^1.100.0` - TypeScript definitions for VS Code API
- **@typescript-eslint/eslint-plugin** `^8.33.1` - TypeScript-specific ESLint rules
- **@typescript-eslint/parser** `^8.33.1` - TypeScript parser for ESLint
- **@vscode/test-cli** `^0.0.10` - VS Code extension testing CLI
- **@vscode/test-electron** `^2.5.2` - VS Code extension testing in Electron environment
- **eslint** `^9.28.0` - Code linting and quality assurance
- **typescript** `^5.8.3` - Primary development language

## License

This extension is licensed under the [MIT License](LICENSE) - making it free for both personal and commercial use.

## Release Notes

### 0.0.1 (Initial Release)

- ✨ SARIF file parsing and analysis
- 🤖 AI-powered fix generation (OpenAI & Azure OpenAI)
- 🎨 Interactive gutter decorations with severity indicators
- 📱 Dual-panel violation browser interface
- 🔧 Automatic code fix application with original code preservation
- 🏢 Corporate proxy and custom endpoint support

---

**Enjoy!**
