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

		// Create a webview panel to display results
		const panel = vscode.window.createWebviewPanel(
			'sarifAiFixer',
			'SARIF AI Fixer Results',
			vscode.ViewColumn.One,
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

		// Generate HTML content for the webview
		panel.webview.html = generateWebviewContent(processedResults);

		// Handle messages from the webview
		panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'generateFix':
						handleGenerateFix(message.data, context, panel);
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

async function handleGenerateFix(data: any, context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
	const apiKey = context.globalState.get<string>('openai-api-key');
	if (!apiKey) {
		vscode.window.showErrorMessage('OpenAI API key not configured. Please run "Configure OpenAI API Key" command first.');
		return;
	}

	try {
		const aiFixGenerator = new AiFixGenerator(apiKey);
		const fix = await aiFixGenerator.generateFix(data.violatedCode, data.sarifResult, data.misraRule);
		
		// Send the fix back to the webview
		panel.webview.postMessage({
			command: 'fixGenerated',
			data: {
				id: data.id,
				fix: fix
			}
		});
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to generate fix: ${error}`);
	}
}

async function handleApplyFix(data: any) {
	try {
		const uri = vscode.Uri.file(data.filePath);
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
		
		// Apply the fix
		const edit = new vscode.WorkspaceEdit();
		const range = new vscode.Range(
			data.startLine - 1,
			data.startColumn - 1,
			data.endLine - 1,
			data.endColumn - 1
		);
		
		edit.replace(uri, range, data.fixedCode);
		await vscode.workspace.applyEdit(edit);
		
		vscode.window.showInformationMessage('Fix applied successfully!');
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to apply fix: ${error}`);
	}
}

function generateWebviewContent(results: any[]): string {
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
		<h1>SARIF AI Fixer Results</h1>
		<p>Found ${results.length} MISRA-C violations that can be processed.</p>
		
		${results.map((result, index) => `
			<div class="violation" id="violation-${index}">
				<div class="rule-header">Rule ${result.sarifResult.ruleId}: ${result.misraRule.title}</div>
				<p><strong>Description:</strong> ${result.misraRule.description}</p>
				<p><strong>Severity:</strong> ${result.misraRule.severity}</p>
				<p><strong>Message:</strong> ${result.sarifResult.message}</p>
				<p><strong>Location:</strong> ${result.sarifResult.locations.map((loc: any) => `${loc.uri}:${loc.startLine}:${loc.startColumn}`).join(', ')}</p>
				
				<button class="button" onclick="generateFix(${index})">Generate AI Fix</button>
				
				<div class="fix-section" id="fix-${index}">
					<h3>AI-Generated Fix:</h3>
					<div id="fix-content-${index}"></div>
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
			
			function applyFix(index, fix) {
				const violationData = ${JSON.stringify(results)}[index];
				const location = violationData.sarifResult.locations[0];
				
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
