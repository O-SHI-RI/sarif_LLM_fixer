// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SarifParser } from './sarifParser';
import { MisraRuleIdentifier } from './misraRuleIdentifier';
import { AiFixGenerator } from './aiFixGenerator';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "sarif-ai-fixer" is now active!');

	const misraRulesPath = path.join(context.extensionPath, 'misra-c.json');
	let misraRuleIdentifier: MisraRuleIdentifier;

	try {
		misraRuleIdentifier = new MisraRuleIdentifier(misraRulesPath);
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to load MISRA rules: ${error}`);
		return;
	}

	// Command to analyze SARIF file
	const analyzeSarifCommand = vscode.commands.registerCommand('sarif-ai-fixer.analyzeSarif', async () => {
		const uris = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectMany: false,
			filters: {
				'SARIF files': ['sarif', 'json']
			}
		});

		if (uris && uris.length > 0) {
			await analyzeSarifFile(uris[0].fsPath, misraRuleIdentifier, context);
		}
	});

	// Command to configure OpenAI API key
	const configureApiKeyCommand = vscode.commands.registerCommand('sarif-ai-fixer.configureApiKey', async () => {
		const apiKey = await vscode.window.showInputBox({
			prompt: 'Enter your OpenAI API key',
			password: true,
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'API key cannot be empty';
				}
				return null;
			}
		});

		if (apiKey) {
			await context.globalState.update('openai-api-key', apiKey);
			vscode.window.showInformationMessage('OpenAI API key configured successfully!');
		}
	});


	context.subscriptions.push(analyzeSarifCommand, configureApiKeyCommand);
}

async function analyzeSarifFile(sarifFilePath: string, misraRuleIdentifier: MisraRuleIdentifier, context: vscode.ExtensionContext) {
	try {
		const sarifContent = fs.readFileSync(sarifFilePath, 'utf8');
		const sarifResults = SarifParser.parseSarifFile(sarifContent);
		const misraResults = SarifParser.filterMisraResults(sarifResults);

		if (misraResults.length === 0) {
			vscode.window.showInformationMessage('No MISRA-C violations found in the SARIF file.');
			return;
		}

		vscode.window.showInformationMessage(`Found ${misraResults.length} MISRA-C violations. Processing...`);

		// Create list view panel
		const listPanel = vscode.window.createWebviewPanel(
			'sarifAiFixerList',
			'SARIF Warnings List',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		// Create detail view panel (initially hidden)
		const detailPanel = vscode.window.createWebviewPanel(
			'sarifAiFixerDetail',
			'SARIF Warning Details',
			vscode.ViewColumn.Two,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		// Process each violation
		const processedResults = [];
		for (const result of misraResults) {
			const misraRule = misraRuleIdentifier.identifyMisraRule(result);
			if (misraRule) {
				processedResults.push({
					sarifResult: result,
					misraRule: misraRule
				});
			}
		}

		// Store results globally for both panels
		(listPanel as any).processedResults = processedResults;
		(detailPanel as any).processedResults = processedResults;

		// Generate HTML content for list view
		listPanel.webview.html = generateListViewContent(processedResults);
		
		// Initially hide detail panel with placeholder content
		detailPanel.webview.html = generatePlaceholderContent();

		// Handle messages from the list panel
		listPanel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'showDetails':
						handleShowDetailsInSeparateWindow(message.data, listPanel, detailPanel, context);
						break;
				}
			},
			undefined,
			context.subscriptions
		);

		// Handle messages from the detail panel
		detailPanel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'generateFix':
						handleGenerateFix(message.data, context, detailPanel);
						break;
					case 'applyFix':
						handleApplyFix(message.data);
						break;
				}
			},
			undefined,
			context.subscriptions
		);

	} catch (error) {
		vscode.window.showErrorMessage(`Failed to analyze SARIF file: ${error}`);
	}
}

async function handleShowDetailsInSeparateWindow(data: any, listPanel: vscode.WebviewPanel, detailPanel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
	console.log('=== Showing Details in Separate Window ===');
	console.log('Warning index:', data.index);
	
	const storedResults = (listPanel as any).processedResults;
	if (storedResults && storedResults[data.index]) {
		const result = storedResults[data.index];
		
		console.log('=== Detail View Violation Debug ===');
		console.log('Selected violation rule ID:', result.sarifResult.ruleId);
		console.log('Selected violation title:', result.misraRule.title);
		console.log('Selected violation message:', result.sarifResult.message);
		
		// Extract actual code from the file
		let violatedCode = 'Could not extract code';
		const location = result.sarifResult.locations[0];
		
		if (location && location.uri) {
			try {
				const fileUri = location.uri.startsWith('file://') ? location.uri.slice(7) : location.uri;
				
				// Convert relative path to absolute path if needed
				let filePath = fileUri;
				if (!path.isAbsolute(filePath)) {
					const workspaceFolders = vscode.workspace.workspaceFolders;
					if (workspaceFolders && workspaceFolders.length > 0) {
						filePath = path.join(workspaceFolders[0].uri.fsPath, filePath);
					}
				}
				
				const fileContent = fs.readFileSync(filePath, 'utf8');
				const lines = fileContent.split('\n');
				
				// Extract the relevant lines around the violation (with some context)
				const startLine = Math.max(0, (location.startLine || 1) - 3);
				const endLine = Math.min(lines.length, (location.endLine || location.startLine || 1) + 2);
				violatedCode = lines.slice(startLine, endLine).join('\n');
				
				console.log('Extracted violated code:', violatedCode);
			} catch (error) {
				console.error('Failed to extract code from file:', error);
				violatedCode = `Error reading file: ${location.uri}`;
			}
		}
		
		// Show detailed view for specific warning in detail panel
		detailPanel.webview.html = generateDetailViewContent(storedResults, data.index, violatedCode);
		
		// Store the current violation index in the detail panel for later use
		(detailPanel as any).currentViolationIndex = data.index;
		
		// Focus the detail panel
		detailPanel.reveal(vscode.ViewColumn.Two);
	}
}

async function handleGenerateFix(data: any, context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
	// Check for API key in environment variable first, then fallback to stored config
	let apiKey = process.env.OPENAI_API_KEY || context.globalState.get<string>('openai-api-key');
	
	if (!apiKey) {
		vscode.window.showErrorMessage('OpenAI API key not found. Please set OPENAI_API_KEY environment variable or run "Configure OpenAI API Key" command.');
		return;
	}

	try {
		console.log('=== Generate Fix Debug ===');
		console.log('Generating fix for violation:', data.sarifResult.ruleId);
		console.log('Rule title:', data.misraRule.title);
		console.log('Location:', data.sarifResult.locations[0]);
		
		// Get the correct violation data based on the currently displayed violation
		const currentViolationIndex = (panel as any).currentViolationIndex;
		const storedResults = (panel as any).processedResults;
		
		let actualViolationData = data;
		if (currentViolationIndex !== undefined && storedResults && storedResults[currentViolationIndex]) {
			actualViolationData = {
				sarifResult: storedResults[currentViolationIndex].sarifResult,
				misraRule: storedResults[currentViolationIndex].misraRule,
				id: data.id
			};
			console.log('Using correct violation data for rule:', actualViolationData.sarifResult.ruleId);
		}
		
		// Extract actual code from the file using the same logic as detail view
		let violatedCode = 'Could not extract code';
		const location = actualViolationData.sarifResult.locations[0];
		
		if (location && location.uri) {
			try {
				const fileUri = location.uri.startsWith('file://') ? location.uri.slice(7) : location.uri;
				
				// Convert relative path to absolute path if needed (same as detail view)
				let filePath = fileUri;
				if (!path.isAbsolute(filePath)) {
					const workspaceFolders = vscode.workspace.workspaceFolders;
					if (workspaceFolders && workspaceFolders.length > 0) {
						filePath = path.join(workspaceFolders[0].uri.fsPath, filePath);
					}
				}
				
				const fileContent = fs.readFileSync(filePath, 'utf8');
				const lines = fileContent.split('\n');
				
				// Extract the relevant lines around the violation (with some context)
				const startLine = Math.max(0, (location.startLine || 1) - 3);
				const endLine = Math.min(lines.length, (location.endLine || location.startLine || 1) + 2);
				violatedCode = lines.slice(startLine, endLine).join('\n');
				
				console.log('Extracted violated code for fix generation:', violatedCode);
			} catch (error) {
				console.error('Failed to extract code from file:', error);
				violatedCode = `Error reading file: ${location.uri}`;
			}
		}

		const aiFixGenerator = new AiFixGenerator(apiKey);
		const fix = await aiFixGenerator.generateFix(violatedCode, actualViolationData.sarifResult, actualViolationData.misraRule);
		
		// Send the fix back to the webview
		console.log('=== Sending fix to webview ===');
		console.log('Panel active?', panel.active);
		console.log('Panel visible?', panel.visible);
		console.log('Fix data:', JSON.stringify(fix, null, 2));
		
		try {
			const result = panel.webview.postMessage({
				command: 'fixGenerated',
				data: {
					id: data.id,
					fix: fix
				}
			});
			console.log('PostMessage result:', result);
			
			// Alternative approach: Update the HTML directly with correct violation data
			setTimeout(() => {
				console.log('Updating webview HTML directly...');
				const storedResults = (panel as any).processedResults;
				const currentViolationIndex = (panel as any).currentViolationIndex;
				
				console.log('Current violation index stored:', currentViolationIndex);
				console.log('Fix generation data.id:', data.id);
				
				if (storedResults && currentViolationIndex !== undefined && storedResults[currentViolationIndex]) {
					// Use the violation that was originally selected in the detail view
					const specificResult = storedResults[currentViolationIndex];
					console.log('Updating with specific result for rule:', specificResult.sarifResult.ruleId);
					const updatedHtml = generateWebviewContentWithFix([specificResult], 0, fix);
					panel.webview.html = updatedHtml;
				}
			}, 1000);
			
		} catch (error) {
			console.log('PostMessage error:', error);
		}
		
		console.log('=== Fix sent to webview ===');
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to generate fix: ${error}`);
	}
}

async function handleApplyFix(data: any) {
	try {
		console.log('=== Apply Fix Debug ===');
		console.log('Data received:', JSON.stringify(data, null, 2));
		console.log('SARIF startLine:', data.startLine, 'endLine:', data.endLine);
		console.log('SARIF startColumn:', data.startColumn, 'endColumn:', data.endColumn);
		
		// Convert relative path to absolute path
		let filePath = data.filePath;
		if (!path.isAbsolute(filePath)) {
			// Try to find the file in the workspace
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders && workspaceFolders.length > 0) {
				filePath = path.join(workspaceFolders[0].uri.fsPath, filePath);
			}
		}
		
		console.log('Original file path:', data.filePath);
		console.log('Resolved file path:', filePath);
		
		const uri = vscode.Uri.file(filePath);
		console.log('File URI:', uri.toString());
		
		const document = await vscode.workspace.openTextDocument(uri);
		console.log('Document opened:', document.fileName);
		console.log('Document line count:', document.lineCount);
		
		await vscode.window.showTextDocument(document);
		
		// Apply the fix - comment out original and add fixed code below
		const edit = new vscode.WorkspaceEdit();
		const startLine = data.startLine - 1;
		const endLine = (data.endLine || data.startLine) - 1; // Use startLine as fallback
		
		console.log('Calculated zero-based range:', startLine, 'to', endLine);
		
		// Get the original lines that need to be commented out
		const originalLines: string[] = [];
		console.log('Zero-based line range:', startLine, 'to', endLine);
		for (let i = startLine; i <= endLine; i++) {
			const lineText = document.lineAt(i).text;
			console.log(`Line ${i}: "${lineText}"`);
			originalLines.push(lineText);
		}
		
		console.log('Original lines to comment out:', originalLines);
		console.log('Fixed code to add:', data.fixedCode);
		
		// Extract the indentation from the first non-empty original line
		let baseIndentation = '';
		for (const line of originalLines) {
			if (line.trim()) { // Find first non-empty line
				const match = line.match(/^(\s*)/);
				baseIndentation = match ? match[1] : '';
				break;
			}
		}
		
		console.log('Base indentation detected:', JSON.stringify(baseIndentation));
		
		// Create the replacement content with proper indentation
		const timestamp = new Date().toLocaleString();
		const commentedOriginal = originalLines.map(line => `// ${line}`).join('\n');
		
		// Apply the same indentation to each line of the fixed code
		const indentedFixedCode = data.fixedCode
			.split('\n')
			.map((line: string, index: number) => {
				if (line.trim() === '') {
					return line; // Keep empty lines as-is
				}
				// For the first line, use the base indentation
				// For subsequent lines, preserve their relative indentation
				if (index === 0) {
					return baseIndentation + line.trim();
				} else {
					// Preserve relative indentation for multi-line fixes
					const lineMatch = line.match(/^(\s*)(.*)/);
					if (lineMatch) {
						const [, lineIndent, content] = lineMatch;
						return baseIndentation + lineIndent + content;
					}
					return baseIndentation + line;
				}
			})
			.join('\n');
		
		const replacementContent = `${commentedOriginal}
// ↑ Original code commented out - MISRA violation fixed by AI-SARIF Fixer (${timestamp})
${indentedFixedCode}`;
		
		// Use the entire line range
		const range = new vscode.Range(
			startLine,
			0, // Start from beginning of line
			endLine,
			document.lineAt(endLine).text.length // End at end of line
		);
		
		console.log('Range to replace:', range);
		console.log('Replacement content:', replacementContent);
		
		edit.replace(uri, range, replacementContent);
		const result = await vscode.workspace.applyEdit(edit);
		
		console.log('Edit applied successfully:', result);
		
		if (result) {
			vscode.window.showInformationMessage('AI fix applied! Original code commented out and replaced with MISRA-compliant code.');
		} else {
			vscode.window.showErrorMessage('Failed to apply edit - edit was rejected');
		}
	} catch (error) {
		console.log('Apply fix error:', error);
		vscode.window.showErrorMessage(`Failed to apply fix: ${error}`);
	}
}

function generatePlaceholderContent(): string {
	return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>SARIF Warning Details</title>
		<style>
			body {
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
				padding: 40px;
				text-align: center;
				color: #586069;
			}
			.placeholder {
				margin-top: 100px;
			}
			.icon {
				font-size: 4em;
				margin-bottom: 20px;
			}
		</style>
	</head>
	<body>
		<div class="placeholder">
			<div class="icon">📋</div>
			<h2>Select a warning from the list</h2>
			<p>Click on any warning in the list view to see detailed information and generate AI fixes.</p>
		</div>
	</body>
	</html>`;
}

function generateListViewContent(results: any[]): string {
	// Group results by file
	const fileGroups = results.reduce((groups, result, index) => {
		const filePath = result.sarifResult.locations[0]?.uri || 'Unknown';
		if (!groups[filePath]) {
			groups[filePath] = [];
		}
		groups[filePath].push({ ...result, index });
		return groups;
	}, {} as Record<string, any[]>);

	const totalWarnings = results.length;
	const fileCount = Object.keys(fileGroups).length;

	return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>SARIF AI Fixer - Warning List</title>
		<style>
			body {
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
				padding: 20px;
				line-height: 1.6;
				margin: 0;
			}
			.header {
				background-color: #f8f9fa;
				padding: 20px;
				border-radius: 8px;
				margin-bottom: 20px;
				border-left: 4px solid #0366d6;
			}
			.summary {
				display: flex;
				gap: 30px;
				margin: 10px 0;
			}
			.stat {
				text-align: center;
			}
			.stat-number {
				font-size: 2em;
				font-weight: bold;
				color: #d73a49;
			}
			.stat-label {
				color: #586069;
				font-size: 0.9em;
			}
			.file-group {
				margin-bottom: 30px;
				border: 1px solid #e1e4e8;
				border-radius: 8px;
				overflow: hidden;
			}
			.file-header {
				background-color: #f6f8fa;
				padding: 15px;
				font-weight: bold;
				color: #24292e;
				border-bottom: 1px solid #e1e4e8;
			}
			.warning-item {
				padding: 15px;
				border-bottom: 1px solid #e1e4e8;
				cursor: pointer;
				transition: background-color 0.2s;
			}
			.warning-item:hover {
				background-color: #f6f8fa;
			}
			.warning-item:last-child {
				border-bottom: none;
			}
			.warning-rule {
				font-weight: bold;
				color: #d73a49;
				margin-bottom: 5px;
			}
			.warning-title {
				font-size: 1.1em;
				color: #24292e;
				margin-bottom: 5px;
			}
			.warning-message {
				color: #586069;
				font-size: 0.9em;
				margin-bottom: 5px;
			}
			.warning-location {
				color: #0366d6;
				font-size: 0.8em;
			}
			.severity-required { border-left: 4px solid #d73a49; }
			.severity-advisory { border-left: 4px solid #f66a0a; }
			.severity-mandatory { border-left: 4px solid #28a745; }
		</style>
	</head>
	<body>
		<div class="header">
			<h1>SARIF Analysis Results</h1>
			<div class="summary">
				<div class="stat">
					<div class="stat-number">${totalWarnings}</div>
					<div class="stat-label">Total Warnings</div>
				</div>
				<div class="stat">
					<div class="stat-number">${fileCount}</div>
					<div class="stat-label">Files Affected</div>
				</div>
			</div>
		</div>

		${Object.entries(fileGroups).map(([filePath, warnings]) => `
			<div class="file-group">
				<div class="file-header">
					📄 ${filePath} (${(warnings as any[]).length} warnings)
				</div>
				${(warnings as any[]).map((warning: any) => `
					<div class="warning-item severity-${warning.misraRule.severity.toLowerCase()}" onclick="showDetails(${warning.index})" title="Click to view details for ${warning.sarifResult.ruleId} (Index: ${warning.index})">
						<div class="warning-rule">Rule ${warning.sarifResult.ruleId}</div>
						<div class="warning-title">${warning.misraRule.title}</div>
						<div class="warning-message">${warning.sarifResult.message}</div>
						<div class="warning-location">
							Line ${warning.sarifResult.locations[0]?.startLine || 'unknown'}:${warning.sarifResult.locations[0]?.startColumn || 'unknown'}
						</div>
					</div>
				`).join('')}
			</div>
		`).join('')}

		<script>
			const vscode = acquireVsCodeApi();
			
			function showDetails(index) {
				console.log('List view: Showing details for index:', index);
				vscode.postMessage({
					command: 'showDetails',
					data: { index: index }
				});
			}
		</script>
	</body>
	</html>`;
}

function generateDetailViewContent(results: any[], warningIndex: number, violatedCode?: string): string {
	const result = results[warningIndex];
	return generateWebviewContentWithCode([result], undefined, undefined, warningIndex, violatedCode);
}

function generateWebviewContentWithCode(results: any[], fixId?: number, fix?: any, warningIndex?: number, violatedCode?: string): string {
	return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>SARIF AI Fixer - Warning Details</title>
		<style>
			body {
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
				padding: 20px;
				line-height: 1.6;
			}
			.violation {
				border: 1px solid #ddd;
				border-radius: 8px;
				padding: 20px;
				margin-bottom: 20px;
				background-color: #f9f9f9;
			}
			.rule-header {
				font-weight: bold;
				font-size: 1.2em;
				margin-bottom: 10px;
				color: #d73a49;
			}
			.code-block {
				background-color: #f6f8fa;
				border: 1px solid #e1e4e8;
				border-radius: 6px;
				padding: 16px;
				font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
				white-space: pre-wrap;
				margin: 10px 0;
				overflow-x: auto;
			}
			.violated-code-section {
				margin: 20px 0;
				padding: 15px;
				background-color: #fff5f5;
				border-left: 4px solid #d73a49;
				border-radius: 6px;
			}
			.button {
				background-color: #0366d6;
				color: white;
				border: none;
				padding: 8px 16px;
				border-radius: 6px;
				cursor: pointer;
				margin-right: 10px;
			}
			.button:hover {
				background-color: #0256cc;
			}
			.fix-section {
				margin-top: 15px;
				padding: 15px;
				background-color: #e6f7ff;
				border-radius: 6px;
				display: none;
			}
		</style>
	</head>
	<body>
		<h1>SARIF AI Fixer - Warning Details</h1>
		<p>Violation details and code analysis.</p>
		
		${results.map((result, index) => `
			<div class="violation" id="violation-${index}">
				<div class="rule-header">Rule ${result.sarifResult.ruleId}: ${result.misraRule.title}</div>
				<p><strong>Description:</strong> ${result.misraRule.description}</p>
				<p><strong>Severity:</strong> ${result.misraRule.severity}</p>
				<p><strong>Message:</strong> ${result.sarifResult.message}</p>
				<p><strong>Location:</strong> ${result.sarifResult.locations.map((loc: any) => `${loc.uri}:${loc.startLine}:${loc.startColumn}`).join(', ')}</p>
				
				${violatedCode ? `
					<div class="violated-code-section">
						<h3>🚨 Violated Code:</h3>
						<div class="code-block">${violatedCode}</div>
					</div>
				` : ''}
				
				<button class="button" onclick="generateFix(${index})">Generate AI Fix</button>
				
				<div class="fix-section" id="fix-${index}" ${fixId === index ? 'style="display: block;"' : ''}>
					<h3>AI-Generated Fix:</h3>
					<div id="fix-content-${index}">
						${fixId === index && fix ? `
							<h4>Original Code:</h4>
							<div class="code-block">${fix.originalCode}</div>
							<h4>Fixed Code:</h4>
							<div class="code-block">${fix.fixedCode}</div>
							<h4>Explanation:</h4>
							<p>${fix.explanation}</p>
							<button class="button" onclick="applyFixDirect(${index}, ${JSON.stringify(fix).replace(/"/g, '&quot;').replace(/\n/g, '\\n')})">Apply Fix</button>
						` : ''}
					</div>
				</div>
			</div>
		`).join('')}
		
		<script>
			const vscode = acquireVsCodeApi();
			
			// Store fixes globally to avoid JSON serialization issues
			window.fixes = {};
			
			function generateFix(index) {
				const violationData = ${JSON.stringify(results)}[index];
				vscode.postMessage({
					command: 'generateFix',
					data: {
						id: index,
						sarifResult: violationData.sarifResult,
						misraRule: violationData.misraRule
					}
				});
				
				document.getElementById('fix-' + index).innerHTML = '<p>Generating fix... Please wait.</p>';
				document.getElementById('fix-' + index).style.display = 'block';
			}
			
			function applyFixDirect(index, fix) {
				const violationData = ${JSON.stringify(results)}[index];
				const location = violationData.sarifResult.locations[0];
				
				console.log('Applying fix for index:', index);
				console.log('Fix data:', fix);
				console.log('Location data:', location);
				
				vscode.postMessage({
					command: 'applyFix',
					data: {
						filePath: location.uri,
						startLine: location.startLine,
						startColumn: location.startColumn,
						endLine: location.endLine,
						endColumn: location.endColumn,
						fixedCode: fix.fixedCode
					}
				});
			}
			
			function applyFix(index) {
				const fix = window.fixes[index];
				if (!fix) {
					console.error('No fix found for index:', index);
					return;
				}
				
				const violationData = ${JSON.stringify(results)}[index];
				const location = violationData.sarifResult.locations[0];
				
				console.log('Applying fix for index:', index);
				console.log('Fix data:', fix);
				console.log('Location data:', location);
				
				vscode.postMessage({
					command: 'applyFix',
					data: {
						filePath: location.uri,
						startLine: location.startLine,
						startColumn: location.startColumn,
						endLine: location.endLine,
						endColumn: location.endColumn,
						fixedCode: fix.fixedCode
					}
				});
			}
			
			window.addEventListener('message', event => {
				const message = event.data;
				console.log('Webview received message:', message);
				
				// Store fixes globally
				window.fixes = {};
				
				switch (message.command) {
					case 'fixGenerated':
						const fix = message.data.fix;
						const id = message.data.id;
						
						// Store the fix globally
						window.fixes[id] = fix;
						
						document.getElementById('fix-content-' + id).innerHTML = \`
							<h4>Original Code:</h4>
							<div class="code-block">\${fix.originalCode}</div>
							<h4>Fixed Code:</h4>
							<div class="code-block">\${fix.fixedCode}</div>
							<h4>Explanation:</h4>
							<p>\${fix.explanation}</p>
							<button class="button" onclick="applyFix(\${id}, \${JSON.stringify(fix).replace(/"/g, '&quot;')})">Apply Fix</button>
						\`;
						
						console.log('Fix UI updated for ID:', id);
						break;
				}
			});
		</script>
	</body>
	</html>`;
}

function generateWebviewContentWithFix(results: any[], fixId: number, fix: any): string {
	// For the fix display, we need to extract the violated code to show it properly
	const result = results[fixId];
	let violatedCode = 'Could not extract code';
	
	if (result) {
		const location = result.sarifResult.locations[0];
		if (location && location.uri) {
			try {
				const fileUri = location.uri.startsWith('file://') ? location.uri.slice(7) : location.uri;
				
				let filePath = fileUri;
				if (!path.isAbsolute(filePath)) {
					const workspaceFolders = vscode.workspace.workspaceFolders;
					if (workspaceFolders && workspaceFolders.length > 0) {
						filePath = path.join(workspaceFolders[0].uri.fsPath, filePath);
					}
				}
				
				const fileContent = fs.readFileSync(filePath, 'utf8');
				const lines = fileContent.split('\n');
				
				const startLine = Math.max(0, (location.startLine || 1) - 3);
				const endLine = Math.min(lines.length, (location.endLine || location.startLine || 1) + 2);
				violatedCode = lines.slice(startLine, endLine).join('\n');
			} catch (error) {
				console.error('Failed to extract code for fix display:', error);
			}
		}
	}
	
	return generateWebviewContentWithCode(results, fixId, fix, fixId, violatedCode);
}

function generateWebviewContent(results: any[], fixId?: number, fix?: any, warningIndex?: number): string {
	return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>SARIF AI Fixer Results</title>
		<style>
			body {
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
				padding: 20px;
				line-height: 1.6;
			}
			.violation {
				border: 1px solid #ddd;
				border-radius: 8px;
				padding: 20px;
				margin-bottom: 20px;
				background-color: #f9f9f9;
			}
			.rule-header {
				font-weight: bold;
				font-size: 1.2em;
				margin-bottom: 10px;
				color: #d73a49;
			}
			.code-block {
				background-color: #f6f8fa;
				border: 1px solid #e1e4e8;
				border-radius: 6px;
				padding: 16px;
				font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
				white-space: pre-wrap;
				margin: 10px 0;
			}
			.button {
				background-color: #0366d6;
				color: white;
				border: none;
				padding: 8px 16px;
				border-radius: 6px;
				cursor: pointer;
				margin-right: 10px;
			}
			.button:hover {
				background-color: #0256cc;
			}
			.fix-section {
				margin-top: 15px;
				padding: 15px;
				background-color: #e6f7ff;
				border-radius: 6px;
				display: none;
			}
		</style>
	</head>
	<body>
		<h1>SARIF AI Fixer - Warning Details</h1>
		<p>Found ${results.length} MISRA-C violation${results.length === 1 ? '' : 's'} that can be processed.</p>
		
		${results.map((result, index) => `
			<div class="violation" id="violation-${index}">
				<div class="rule-header">Rule ${result.sarifResult.ruleId}: ${result.misraRule.title}</div>
				<p><strong>Description:</strong> ${result.misraRule.description}</p>
				<p><strong>Severity:</strong> ${result.misraRule.severity}</p>
				<p><strong>Message:</strong> ${result.sarifResult.message}</p>
				<p><strong>Location:</strong> ${result.sarifResult.locations.map((loc: any) => `${loc.uri}:${loc.startLine}:${loc.startColumn}`).join(', ')}</p>
				
				<button class="button" onclick="generateFix(${index})">Generate AI Fix</button>
				
				<div class="fix-section" id="fix-${index}" ${fixId === index ? 'style="display: block;"' : ''}>
					<h3>AI-Generated Fix:</h3>
					<div id="fix-content-${index}">
						${fixId === index && fix ? `
							<h4>Original Code:</h4>
							<div class="code-block">${fix.originalCode}</div>
							<h4>Fixed Code:</h4>
							<div class="code-block">${fix.fixedCode}</div>
							<h4>Explanation:</h4>
							<p>${fix.explanation}</p>
							<button class="button" onclick="applyFixDirect(${index}, ${JSON.stringify(fix).replace(/"/g, '&quot;').replace(/\n/g, '\\n')})">Apply Fix</button>
						` : ''}
					</div>
				</div>
			</div>
		`).join('')}
		
		<script>
			const vscode = acquireVsCodeApi();
			
			function generateFix(index) {
				const violationData = ${JSON.stringify(results)}[index];
				vscode.postMessage({
					command: 'generateFix',
					data: {
						id: index,
						violatedCode: 'Code from file', // This would need to be extracted from the actual file
						sarifResult: violationData.sarifResult,
						misraRule: violationData.misraRule
					}
				});
				
				document.getElementById('fix-' + index).innerHTML = '<p>Generating fix... Please wait.</p>';
				document.getElementById('fix-' + index).style.display = 'block';
			}
			
			function applyFixDirect(index, fix) {
				const violationData = ${JSON.stringify(results)}[index];
				const location = violationData.sarifResult.locations[0];
				
				console.log('Applying fix for index:', index);
				console.log('Fix data:', fix);
				console.log('Location data:', location);
				
				vscode.postMessage({
					command: 'applyFix',
					data: {
						filePath: location.uri,
						startLine: location.startLine,
						startColumn: location.startColumn,
						endLine: location.endLine,
						endColumn: location.endColumn,
						fixedCode: fix.fixedCode
					}
				});
			}
			
			function applyFix(index) {
				const fix = window.fixes[index];
				if (!fix) {
					console.error('No fix found for index:', index);
					return;
				}
				
				const violationData = ${JSON.stringify(results)}[index];
				const location = violationData.sarifResult.locations[0];
				
				console.log('Applying fix for index:', index);
				console.log('Fix data:', fix);
				console.log('Location data:', location);
				
				vscode.postMessage({
					command: 'applyFix',
					data: {
						filePath: location.uri,
						startLine: location.startLine,
						startColumn: location.startColumn,
						endLine: location.endLine,
						endColumn: location.endColumn,
						fixedCode: fix.fixedCode
					}
				});
			}
			
			window.addEventListener('message', event => {
				const message = event.data;
				console.log('Webview received message:', message);
				switch (message.command) {
					case 'fixGenerated':
						const fix = message.data.fix;
						const id = message.data.id;
						
						document.getElementById('fix-content-' + id).innerHTML = \`
							<h4>Original Code:</h4>
							<div class="code-block">\${fix.originalCode}</div>
							<h4>Fixed Code:</h4>
							<div class="code-block">\${fix.fixedCode}</div>
							<h4>Explanation:</h4>
							<p>\${fix.explanation}</p>
							<button class="button" onclick="applyFix(\${id}, \${JSON.stringify(fix).replace(/"/g, '&quot;')})">Apply Fix</button>
						\`;
						break;
				}
			});
		</script>
	</body>
	</html>`;
}

// This method is called when your extension is deactivated
export function deactivate() {}
