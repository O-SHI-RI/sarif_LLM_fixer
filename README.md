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

## Dependencies & Licensing

This extension uses corporate-friendly, permissive open-source packages:

### Runtime Dependencies
- **[axios](https://github.com/axios/axios)** `^1.9.0` - MIT License
  - HTTP client for AI API communication
  - Used for OpenAI and Azure OpenAI API requests

### Development Dependencies
- **[TypeScript](https://github.com/microsoft/TypeScript)** `^5.8.3` - Apache-2.0 License
  - Primary development language
- **[ESLint](https://github.com/eslint/eslint)** `^9.25.1` - MIT License
  - Code linting and quality assurance
- **[@typescript-eslint/eslint-plugin](https://github.com/typescript-eslint/typescript-eslint)** `^8.31.1` - MIT License
  - TypeScript-specific ESLint rules
- **[@typescript-eslint/parser](https://github.com/typescript-eslint/typescript-eslint)** `^8.31.1` - MIT License
  - TypeScript parser for ESLint
- **[@types/vscode](https://github.com/DefinitelyTyped/DefinitelyTyped)** `^1.99.0` - MIT License
  - TypeScript definitions for VS Code API
- **[@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped)** `20.x` - MIT License
  - TypeScript definitions for Node.js
- **[@types/mocha](https://github.com/DefinitelyTyped/DefinitelyTyped)** `^10.0.10` - MIT License
  - TypeScript definitions for Mocha testing framework
- **[@vscode/test-cli](https://github.com/microsoft/vscode-test)** `^0.0.10` - MIT License
  - VS Code extension testing CLI
- **[@vscode/test-electron](https://github.com/microsoft/vscode-test)** `^2.5.2` - MIT License
  - VS Code extension testing in Electron environment

### License Summary
- **Total packages**: ~260 (including transitive dependencies)
- **MIT License**: 193 packages (74%) - Most permissive
- **Apache-2.0**: 14 packages (5%) - Business-friendly with patent protection
- **ISC License**: 35 packages (13%) - Permissive, similar to MIT
- **BSD Licenses**: 13 packages (5%) - Permissive with attribution
- **Other permissive**: 6 packages (2%)

### Corporate Compliance
✅ **100% Corporate-Friendly**: All dependencies use permissive licenses  
✅ **No Copyleft**: No GPL, AGPL, or other viral licenses  
✅ **Commercial Use**: All packages allow commercial usage and modification  
✅ **Patent Safe**: Apache-2.0 packages include patent protection clauses

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
