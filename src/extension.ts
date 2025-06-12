// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SarifParser } from './sarifParser';
import { MisraRuleIdentifier } from './misraRuleIdentifier';
import { AiFixGenerator, AiApiConfig } from './aiFixGenerator';

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


	// Unified command to configure AI API (choose between OpenAI and Azure OpenAI)
	const configureAiApiCommand = vscode.commands.registerCommand('sarif-ai-fixer.configureAiApi', async () => {
		// Ask user to choose API provider
		const apiProvider = await vscode.window.showQuickPick([
			{
				label: '$(cloud) OpenAI',
				detail: 'Use OpenAI API directly (requires OpenAI API key)',
				value: 'openai'
			},
			{
				label: '$(azure) Azure OpenAI',
				detail: 'Use Azure OpenAI service (requires Azure OpenAI deployment)',
				value: 'azure'
			}
		], {
			placeHolder: 'Choose your AI API provider',
			title: 'SARIF AI Fixer - API Configuration'
		});

		if (!apiProvider) return;

		if (apiProvider.value === 'openai') {
			// Configure OpenAI
			await configureOpenAiApi(context);
		} else {
			// Configure Azure OpenAI
			await configureAzureOpenAiApi(context);
		}
	});

	// Command to configure Azure OpenAI
	const configureAzureApiCommand = vscode.commands.registerCommand('sarif-ai-fixer.configureAzureApi', async () => {
		await configureAzureOpenAiApi(context);
	});

	// Legacy command to configure OpenAI API key (keep for backward compatibility)
	const legacyConfigureApiKeyCommand = vscode.commands.registerCommand('sarif-ai-fixer.configureApiKey', async () => {
		await configureOpenAiApi(context);
	});

	async function configureOpenAiApi(context: vscode.ExtensionContext) {
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
			await context.globalState.update('api-type', 'openai');
			vscode.window.showInformationMessage('✅ OpenAI API configured successfully!');
		}
	}

	async function configureAzureOpenAiApi(context: vscode.ExtensionContext) {
		const apiKey = await vscode.window.showInputBox({
			prompt: 'Enter your Azure OpenAI API key',
			password: true,
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'API key cannot be empty';
				}
				return null;
			}
		});

		if (!apiKey) return;

		const apiUrl = await vscode.window.showInputBox({
			prompt: 'Enter your Azure OpenAI endpoint (e.g., https://your-resource.openai.azure.com)',
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'API endpoint cannot be empty';
				}
				if (!value.startsWith('https://')) {
					return 'API endpoint must start with https://';
				}
				return null;
			}
		});

		if (!apiUrl) return;

		const deploymentName = await vscode.window.showInputBox({
			prompt: 'Enter your Azure OpenAI deployment name (e.g., gpt-4)',
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'Deployment name cannot be empty';
				}
				return null;
			}
		});

		if (!deploymentName) return;

		const apiVersion = await vscode.window.showInputBox({
			prompt: 'Enter API version (default: 2024-02-15-preview)',
			value: '2024-02-15-preview'
		});

		// Save all Azure OpenAI configuration
		await context.globalState.update('api-type', 'azure');
		await context.globalState.update('azure-api-key', apiKey);
		await context.globalState.update('azure-api-url', apiUrl);
		await context.globalState.update('azure-deployment-name', deploymentName);
		await context.globalState.update('azure-api-version', apiVersion || '2024-02-15-preview');

		vscode.window.showInformationMessage('✅ Azure OpenAI API configured successfully!');
	}

	// Command to show current API configuration status
	const showApiStatusCommand = vscode.commands.registerCommand('sarif-ai-fixer.showApiStatus', async () => {
		const apiConfig = await buildApiConfig(context);
		
		if (!apiConfig) {
			vscode.window.showInformationMessage(
				'❌ No AI API configured. Use "SARIF AI Fixer: Configure AI API" to set up your provider.',
				'Configure Now'
			).then(selection => {
				if (selection === 'Configure Now') {
					vscode.commands.executeCommand('sarif-ai-fixer.configureAiApi');
				}
			});
			return;
		}

		let statusMessage = '';
		if (apiConfig.apiType === 'azure') {
			statusMessage = `✅ **Azure OpenAI** configured\n\n` +
						   `• Endpoint: ${apiConfig.apiUrl}\n` +
						   `• Deployment: ${apiConfig.deploymentName}\n` +
						   `• API Version: ${apiConfig.apiVersion}\n` +
						   `• Configuration: ${process.env.AZURE_OPENAI_API_KEY ? 'Environment Variable' : 'VS Code Settings'}`;
		} else {
			statusMessage = `✅ **OpenAI** configured\n\n` +
						   `• API Endpoint: https://api.openai.com/v1/chat/completions\n` +
						   `• Model: gpt-4o\n` +
						   `• Configuration: ${process.env.OPENAI_API_KEY ? 'Environment Variable' : 'VS Code Settings'}`;
		}

		const selection = await vscode.window.showInformationMessage(
			statusMessage,
			'Change Provider',
			'Reconfigure'
		);

		if (selection === 'Change Provider') {
			vscode.commands.executeCommand('sarif-ai-fixer.configureAiApi');
		} else if (selection === 'Reconfigure') {
			if (apiConfig.apiType === 'azure') {
				vscode.commands.executeCommand('sarif-ai-fixer.configureAzureApi');
			} else {
				vscode.commands.executeCommand('sarif-ai-fixer.configureApiKey');
			}
		}
	});

	// Command to show SARIF warning details (can be triggered from gutter or context menu)
	const showWarningDetailsCommand = vscode.commands.registerCommand('sarif-ai-fixer.showWarningDetails', async () => {
		if (!globalProcessedResults.length || !globalDetailPanel) {
			vscode.window.showInformationMessage('No SARIF warnings are currently loaded.');
			return;
		}

		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}

		const currentLine = activeEditor.selection.active.line;
		const violationIndex = findViolationAtLocation(activeEditor.document.uri.fsPath, currentLine);

		if (violationIndex !== -1) {
			console.log('=== Show Warning Details Command ===');
			console.log('File:', activeEditor.document.uri.fsPath);
			console.log('Line:', currentLine + 1);
			console.log('Violation index:', violationIndex);

			await handleShowDetailsInSeparateWindow(
				{ index: violationIndex },
				globalListPanel!,
				globalDetailPanel,
				context
			);
		} else {
			vscode.window.showInformationMessage('No SARIF warning found at current cursor position.');
		}
	});


	context.subscriptions.push(
		analyzeSarifCommand, 
		configureAiApiCommand,           // New unified command
		showApiStatusCommand,            // Show current API status
		legacyConfigureApiKeyCommand,    // Legacy OpenAI command (backward compatibility)
		configureAzureApiCommand,        // Legacy Azure command (backward compatibility)
		showWarningDetailsCommand
	);
}

// Global variables to store decorations and panel references
let warningDecorations: Map<string, vscode.TextEditorDecorationType> = new Map();
let globalProcessedResults: any[] = [];
let globalListPanel: vscode.WebviewPanel | undefined;
let globalDetailPanel: vscode.WebviewPanel | undefined;

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

		// Intelligent window positioning
		const windowLayout = determineWindowLayout();
		console.log('=== Window Layout Strategy ===');
		console.log('Current layout:', windowLayout);

		// Create list view panel with intelligent positioning
		const listPanel = vscode.window.createWebviewPanel(
			'sarifAiFixerList',
			'SARIF Warnings',
			windowLayout.listColumn,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		// Create detail view panel with intelligent positioning
		const detailPanel = vscode.window.createWebviewPanel(
			'sarifAiFixerDetail',
			'SARIF Details',
			windowLayout.detailColumn,
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

		// Store results globally for both panels and gutter decorations
		(listPanel as any).processedResults = processedResults;
		(detailPanel as any).processedResults = processedResults;
		globalProcessedResults = processedResults;
		globalListPanel = listPanel;
		globalDetailPanel = detailPanel;

		// Add gutter decorations for all warnings
		await addGutterDecorations(processedResults, context);

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

function determineWindowLayout() {
	// Check current window state and determine optimal positioning
	const activeEditor = vscode.window.activeTextEditor;
	const visibleEditors = vscode.window.visibleTextEditors;
	
	// Strategy based on user requirements:
	// - If only 1 window open: Create new window for list (Column Two), detail in Column Three
	// - If 2+ windows open: Use non-active window for list, detail in Column Three
	// - Always preserve the active source file position
	
	const hasActiveSource = !!activeEditor;
	const windowCount = visibleEditors.length;
	
	console.log('=== Window Layout Analysis ===');
	console.log('Active editor:', activeEditor?.document.fileName);
	console.log('Visible editors count:', windowCount);
	console.log('Has active source:', hasActiveSource);
	
	// Determine columns based on current layout
	let listColumn = vscode.ViewColumn.Two;
	let detailColumn = vscode.ViewColumn.Three;
	
	if (windowCount === 0) {
		// No windows open - start fresh
		listColumn = vscode.ViewColumn.One;
		detailColumn = vscode.ViewColumn.Two;
	} else if (windowCount === 1) {
		// One window open - add list in Column Two, detail in Column Three
		listColumn = vscode.ViewColumn.Two;
		detailColumn = vscode.ViewColumn.Three;
	} else {
		// Multiple windows - use intelligent positioning
		// Find a non-active column for the list
		const activeColumn = activeEditor?.viewColumn || vscode.ViewColumn.One;
		
		if (activeColumn === vscode.ViewColumn.One) {
			listColumn = vscode.ViewColumn.Two;
			detailColumn = vscode.ViewColumn.Three;
		} else if (activeColumn === vscode.ViewColumn.Two) {
			listColumn = vscode.ViewColumn.Three;
			detailColumn = vscode.ViewColumn.One;
		} else {
			listColumn = vscode.ViewColumn.One;
			detailColumn = vscode.ViewColumn.Two;
		}
	}
	
	const layout = {
		listColumn,
		detailColumn,
		sourceColumn: activeEditor?.viewColumn || vscode.ViewColumn.One,
		hasActiveSource,
		windowCount
	};
	
	console.log('Determined layout:', layout);
	return layout;
}

async function buildApiConfig(context: vscode.ExtensionContext): Promise<AiApiConfig | null> {
	// Check for environment variables first (for development/CI)
	if (process.env.OPENAI_API_KEY) {
		return {
			apiType: 'openai',
			apiKey: process.env.OPENAI_API_KEY
		};
	}

	if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_DEPLOYMENT) {
		return {
			apiType: 'azure',
			apiKey: process.env.AZURE_OPENAI_API_KEY,
			apiUrl: process.env.AZURE_OPENAI_ENDPOINT,
			deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT,
			apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview'
		};
	}

	// Check stored configuration
	const apiType = context.globalState.get<string>('api-type');
	
	if (apiType === 'azure') {
		const apiKey = context.globalState.get<string>('azure-api-key');
		const apiUrl = context.globalState.get<string>('azure-api-url');
		const deploymentName = context.globalState.get<string>('azure-deployment-name');
		const apiVersion = context.globalState.get<string>('azure-api-version');

		if (apiKey && apiUrl && deploymentName) {
			return {
				apiType: 'azure',
				apiKey,
				apiUrl,
				deploymentName,
				apiVersion: apiVersion || '2024-02-15-preview'
			};
		}
	} else if (apiType === 'openai' || !apiType) {
		const apiKey = context.globalState.get<string>('openai-api-key');
		if (apiKey) {
			return {
				apiType: 'openai',
				apiKey
			};
		}
	}

	return null;
}

// Helper function to create SVG icon for different severity levels
function createWarningIcon(severity: string): string {
	const colors = {
		'Required': { fill: '#f14c4c', text: '●' },    // Red for required violations
		'Advisory': { fill: '#ff8c00', text: '▲' },    // Orange for advisory
		'Mandatory': { fill: '#a6e22e', text: '◆' },  // Green for mandatory
		'default': { fill: '#ff8c00', text: '!' }      // Orange default
	};
	
	const config = colors[severity as keyof typeof colors] || colors.default;
	
	return `
		<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
			<circle cx="8" cy="8" r="7" fill="${config.fill}" stroke="#ffffff" stroke-width="1"/>
			<text x="8" y="12" font-family="Arial, sans-serif" font-size="10" font-weight="bold" 
				  text-anchor="middle" fill="#ffffff">${config.text}</text>
		</svg>
	`;
}

async function addGutterDecorations(processedResults: any[], context: vscode.ExtensionContext) {
	console.log('=== Adding Gutter Decorations ===');
	console.log('Processing', processedResults.length, 'warnings for gutter decorations');
	
	// Clear existing decorations
	clearGutterDecorations();
	
	// Create default decoration type for SARIF warnings with gutter icons
	const warningDecorationType = vscode.window.createTextEditorDecorationType({
		// Gutter icon (where breakpoints appear) - using dynamic icon based on severity
		gutterIconPath: vscode.Uri.parse('data:image/svg+xml;base64,' + 
			Buffer.from(createWarningIcon('default')).toString('base64')),
		gutterIconSize: 'contain',
		
		// Overview ruler
		overviewRulerColor: '#ff8c00',
		overviewRulerLane: vscode.OverviewRulerLane.Right,
		
		// Line highlighting
		backgroundColor: 'rgba(255, 140, 0, 0.05)',
		isWholeLine: false,
		border: '1px solid rgba(255, 140, 0, 0.3)',
		borderRadius: '3px'
	});
	
	// Group decorations by file
	const decorationsByFile: Map<string, { ranges: vscode.Range[], violationIndexes: number[] }> = new Map();
	
	processedResults.forEach((result, index) => {
		const location = result.sarifResult.locations[0];
		if (!location || !location.uri) return;
		
		const fileUri = location.uri.startsWith('file://') ? location.uri.slice(7) : location.uri;
		let filePath = fileUri;
		
		// Convert relative path to absolute path
		if (!path.isAbsolute(filePath)) {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders && workspaceFolders.length > 0) {
				filePath = path.join(workspaceFolders[0].uri.fsPath, filePath);
			}
		}
		
		const startLine = (location.startLine || 1) - 1; // Convert to 0-based
		const startColumn = (location.startColumn || 1) - 1;
		const endLine = (location.endLine || location.startLine || 1) - 1;
		const endColumn = location.endColumn ? location.endColumn - 1 : startColumn + 100;
		
		const range = new vscode.Range(startLine, startColumn, endLine, endColumn);
		
		if (!decorationsByFile.has(filePath)) {
			decorationsByFile.set(filePath, { ranges: [], violationIndexes: [] });
		}
		
		decorationsByFile.get(filePath)!.ranges.push(range);
		decorationsByFile.get(filePath)!.violationIndexes.push(index);
		
		console.log(`Adding decoration for ${filePath} at line ${startLine + 1}`);
	});
	
	// Apply decorations to currently open editors
	for (const editor of vscode.window.visibleTextEditors) {
		const filePath = editor.document.uri.fsPath;
		const fileName = path.basename(filePath);
		
		// Find decorations for this file (by exact path or by filename match)
		let decorations = decorationsByFile.get(filePath);
		
		// If no exact match, try to find by filename
		if (!decorations) {
			for (const [decorationPath, decorationData] of decorationsByFile.entries()) {
				const decorationFileName = path.basename(decorationPath);
				if (decorationFileName === fileName || 
				   (decorationFileName === 'multi_misra_violation.c' && fileName === 'misra_c_sample.c') ||
				   (decorationFileName === 'misra_c_sample.c' && fileName === 'multi_misra_violation.c')) {
					decorations = decorationData;
					console.log(`Found decorations by filename match: ${decorationFileName} -> ${fileName}`);
					break;
				}
			}
		}
		
		if (decorations) {
			console.log(`Applying ${decorations.ranges.length} decorations to ${filePath}`);
			
			// Store decoration type for later cleanup
			warningDecorations.set(filePath, warningDecorationType);
			
			// Create severity-specific decorations
			const decorationsBySeverity: Map<string, { decorationType: vscode.TextEditorDecorationType, options: vscode.DecorationOptions[] }> = new Map();
			
			decorations.ranges.forEach((range, i) => {
				const violationIndex = decorations.violationIndexes[i];
				const violation = processedResults[violationIndex];
				const severity = violation.misraRule.severity;
				
				// Create decoration type for this severity if not exists
				if (!decorationsBySeverity.has(severity)) {
					const severityDecorationType = vscode.window.createTextEditorDecorationType({
						gutterIconPath: vscode.Uri.parse('data:image/svg+xml;base64,' + 
							Buffer.from(createWarningIcon(severity)).toString('base64')),
						gutterIconSize: 'contain',
						overviewRulerColor: severity === 'Required' ? '#f14c4c' : severity === 'Mandatory' ? '#a6e22e' : '#ff8c00',
						overviewRulerLane: vscode.OverviewRulerLane.Right,
						backgroundColor: severity === 'Required' ? 'rgba(241, 76, 76, 0.05)' : 
										severity === 'Mandatory' ? 'rgba(166, 226, 46, 0.05)' : 'rgba(255, 140, 0, 0.05)',
						isWholeLine: false,
						border: severity === 'Required' ? '1px solid rgba(241, 76, 76, 0.3)' : 
								severity === 'Mandatory' ? '1px solid rgba(166, 226, 46, 0.3)' : '1px solid rgba(255, 140, 0, 0.3)',
						borderRadius: '3px'
					});
					
					decorationsBySeverity.set(severity, { decorationType: severityDecorationType, options: [] });
					warningDecorations.set(`${filePath}-${severity}`, severityDecorationType);
				}
				
				// Add decoration option for this violation
				const decorationOption: vscode.DecorationOptions = {
					range,
					hoverMessage: new vscode.MarkdownString(
						`**MISRA ${violation.sarifResult.ruleId}** (${severity}): ${violation.misraRule.title}\n\n` +
						`${violation.sarifResult.message}\n\n` +
						`*Click on this line to show details*`
					)
				};
				
				decorationsBySeverity.get(severity)!.options.push(decorationOption);
			});
			
			// Apply all severity-specific decorations
			decorationsBySeverity.forEach(({ decorationType, options }) => {
				editor.setDecorations(decorationType, options);
			});
		}
	}
	
	// Register event listeners for editor changes and clicks
	registerEventListeners(context);
}

function clearGutterDecorations() {
	console.log('Clearing existing gutter decorations');
	
	// Dispose of existing decoration types
	warningDecorations.forEach((decorationType) => {
		decorationType.dispose();
	});
	warningDecorations.clear();
	
	// Clear decorations from all editors
	vscode.window.visibleTextEditors.forEach(editor => {
		editor.setDecorations(vscode.window.createTextEditorDecorationType({}), []);
	});
}

function registerEventListeners(context: vscode.ExtensionContext) {
	console.log('Registering event listeners for gutter interactions');
	
	// Listen for text editor selection changes to detect clicks on decorated lines
	const selectionChangeListener = vscode.window.onDidChangeTextEditorSelection(async (event) => {
		if (!globalProcessedResults.length || !globalDetailPanel) return;
		
		const editor = event.textEditor;
		const selection = event.selections[0];
		
		// Check if the selection is on a line with a SARIF warning
		const violationIndex = findViolationAtLocation(editor.document.uri.fsPath, selection.start.line);
		
		if (violationIndex !== -1) {
			console.log('=== Click on SARIF Warning Line ===');
			console.log('File:', editor.document.uri.fsPath);
			console.log('Line:', selection.start.line + 1);
			console.log('Violation index:', violationIndex);
			console.log('Selection change kind:', event.kind);
			
			// Show the detail view for this specific violation
			await handleShowDetailsInSeparateWindow(
				{ index: violationIndex }, 
				globalListPanel!, 
				globalDetailPanel, 
				context
			);
		}
	});
	
	// Listen for when editors are opened to apply decorations
	const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
		if (!editor || !globalProcessedResults.length) return;
		
		console.log('=== Active Editor Changed ===');
		console.log('New active editor:', editor.document.uri.fsPath);
		
		// Apply decorations to the newly opened editor if it has violations
		await refreshDecorationsForEditor(editor);
	});
	
	// Listen for when visible editors change
	const visibleEditorsChangeListener = vscode.window.onDidChangeVisibleTextEditors(async (editors) => {
		if (!globalProcessedResults.length) return;
		
		console.log('=== Visible Editors Changed ===');
		console.log('Visible editors count:', editors.length);
		
		// Apply decorations to all newly visible editors
		for (const editor of editors) {
			await refreshDecorationsForEditor(editor);
		}
	});
	
	context.subscriptions.push(selectionChangeListener, editorChangeListener, visibleEditorsChangeListener);
}

async function refreshDecorationsForEditor(editor: vscode.TextEditor) {
	const filePath = editor.document.uri.fsPath;
	const fileName = path.basename(filePath);
	
	console.log('=== Refreshing Decorations ===');
	console.log('Editor file:', filePath);
	console.log('Editor filename:', fileName);
	
	// Find violations for this file
	const fileViolations: { range: vscode.Range, violationIndex: number }[] = [];
	
	globalProcessedResults.forEach((result, index) => {
		const location = result.sarifResult.locations[0];
		if (!location || !location.uri) return;
		
		let violationFilePath = location.uri.startsWith('file://') ? location.uri.slice(7) : location.uri;
		
		// Convert relative path to absolute path
		if (!path.isAbsolute(violationFilePath)) {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders && workspaceFolders.length > 0) {
				violationFilePath = path.join(workspaceFolders[0].uri.fsPath, violationFilePath);
			}
		}
		
		const violationFileName = path.basename(violationFilePath);
		
		// Check both exact path match and filename match
		const pathMatch = violationFilePath === filePath;
		const fileNameMatch = violationFileName === fileName || 
							  (violationFileName === 'multi_misra_violation.c' && fileName === 'misra_c_sample.c') ||
							  (violationFileName === 'misra_c_sample.c' && fileName === 'multi_misra_violation.c');
		
		console.log(`Checking violation ${index}: ${violationFileName} (path match: ${pathMatch}, filename match: ${fileNameMatch})`);
		
		if (pathMatch || fileNameMatch) {
			const startLine = (location.startLine || 1) - 1;
			const startColumn = (location.startColumn || 1) - 1;
			const endLine = (location.endLine || location.startLine || 1) - 1;
			const endColumn = location.endColumn ? location.endColumn - 1 : startColumn + 100;
			
			const range = new vscode.Range(startLine, startColumn, endLine, endColumn);
			fileViolations.push({ range, violationIndex: index });
			console.log(`Added violation at line ${startLine + 1}`);
		}
	});
	
	if (fileViolations.length > 0) {
		console.log(`Applying ${fileViolations.length} decorations to ${filePath}`);
		
		// Create severity-specific decorations
		const decorationsBySeverity: Map<string, { decorationType: vscode.TextEditorDecorationType, options: vscode.DecorationOptions[] }> = new Map();
		
		fileViolations.forEach(({ range, violationIndex }) => {
			const violation = globalProcessedResults[violationIndex];
			const severity = violation.misraRule.severity;
			
			// Create decoration type for this severity if not exists
			if (!decorationsBySeverity.has(severity)) {
				const severityDecorationType = vscode.window.createTextEditorDecorationType({
					gutterIconPath: vscode.Uri.parse('data:image/svg+xml;base64,' + 
						Buffer.from(createWarningIcon(severity)).toString('base64')),
					gutterIconSize: 'contain',
					overviewRulerColor: severity === 'Required' ? '#f14c4c' : severity === 'Mandatory' ? '#a6e22e' : '#ff8c00',
					overviewRulerLane: vscode.OverviewRulerLane.Right,
					backgroundColor: severity === 'Required' ? 'rgba(241, 76, 76, 0.05)' : 
									severity === 'Mandatory' ? 'rgba(166, 226, 46, 0.05)' : 'rgba(255, 140, 0, 0.05)',
					isWholeLine: false,
					border: severity === 'Required' ? '1px solid rgba(241, 76, 76, 0.3)' : 
							severity === 'Mandatory' ? '1px solid rgba(166, 226, 46, 0.3)' : '1px solid rgba(255, 140, 0, 0.3)',
					borderRadius: '3px'
				});
				
				decorationsBySeverity.set(severity, { decorationType: severityDecorationType, options: [] });
				warningDecorations.set(`${filePath}-${severity}`, severityDecorationType);
			}
			
			// Add decoration option for this violation
			const decorationOption: vscode.DecorationOptions = {
				range,
				hoverMessage: new vscode.MarkdownString(
					`**MISRA ${violation.sarifResult.ruleId}** (${severity}): ${violation.misraRule.title}\n\n` +
					`${violation.sarifResult.message}\n\n` +
					`*Click on this line to show details*`
				)
			};
			
			decorationsBySeverity.get(severity)!.options.push(decorationOption);
		});
		
		// Apply all severity-specific decorations
		decorationsBySeverity.forEach(({ decorationType, options }) => {
			editor.setDecorations(decorationType, options);
		});
	}
}

function findViolationAtLocation(filePath: string, line: number): number {
	console.log('=== Finding Violation at Location ===');
	console.log('File:', filePath);
	console.log('Line:', line + 1);
	
	// Get just the filename for comparison
	const currentFileName = path.basename(filePath);
	console.log('Current filename:', currentFileName);
	
	for (let i = 0; i < globalProcessedResults.length; i++) {
		const result = globalProcessedResults[i];
		const location = result.sarifResult.locations[0];
		
		if (!location || !location.uri) continue;
		
		let violationFilePath = location.uri.startsWith('file://') ? location.uri.slice(7) : location.uri;
		
		// Convert relative path to absolute path if needed
		if (!path.isAbsolute(violationFilePath)) {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders && workspaceFolders.length > 0) {
				violationFilePath = path.join(workspaceFolders[0].uri.fsPath, violationFilePath);
			}
		}
		
		const violationLine = (location.startLine || 1) - 1; // Convert to 0-based
		const violationFileName = path.basename(violationFilePath);
		
		console.log(`Checking violation ${i}: ${violationFileName} line ${violationLine + 1}`);
		
		// Check both exact path match and filename match (for cases where SARIF references different but similar files)
		const pathMatch = violationFilePath === filePath;
		const fileNameMatch = violationFileName === currentFileName || 
							  (violationFileName === 'multi_misra_violation.c' && currentFileName === 'misra_c_sample.c') ||
							  (violationFileName === 'misra_c_sample.c' && currentFileName === 'multi_misra_violation.c');
		
		// Also check if we're within a reasonable range of the violation line (±2 lines)
		const lineMatch = Math.abs(violationLine - line) <= 2;
		
		console.log(`  Path match: ${pathMatch}, File match: ${fileNameMatch}, Line match: ${lineMatch}`);
		console.log(`  Violation line: ${violationLine + 1}, Click line: ${line + 1}, Difference: ${Math.abs(violationLine - line)}`);
		
		if ((pathMatch || fileNameMatch) && (violationLine === line || lineMatch)) {
			console.log('Found matching violation at index:', i);
			return i;
		}
	}
	
	console.log('No matching violation found');
	return -1;
}

async function handleShowDetailsInSeparateWindow(data: any, listPanel: vscode.WebviewPanel, detailPanel: vscode.WebviewPanel, _context: vscode.ExtensionContext) {
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
		
		// Focus the detail panel using intelligent positioning
		const currentLayout = determineWindowLayout();
		detailPanel.reveal(currentLayout.detailColumn);
	}
}

async function handleGenerateFix(data: any, context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
	// Build API configuration based on stored settings
	const apiConfig = await buildApiConfig(context);
	
	if (!apiConfig) {
		vscode.window.showErrorMessage('No AI API configuration found. Please configure either OpenAI or Azure OpenAI API settings.');
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

		const aiFixGenerator = new AiFixGenerator(apiConfig);
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
		
		// Get window layout before opening file to maintain panel positioning
		const windowLayout = determineWindowLayout();
		console.log('Using window layout for fix application:', windowLayout);
		
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
		
		// Open the document in the original source column to preserve layout
		await vscode.window.showTextDocument(document, {
			viewColumn: windowLayout.sourceColumn,
			preserveFocus: false
		});
		
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
	// Create a compact CLI-style list
	const totalWarnings = results.length;
	const fileCount = new Set(results.map(r => r.sarifResult.locations[0]?.uri || 'Unknown')).size;

	return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>SARIF Warnings</title>
		<style>
			body {
				font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
				padding: 10px;
				margin: 0;
				background-color: #1e1e1e;
				color: #d4d4d4;
				font-size: 12px;
				line-height: 1.4;
			}
			.header {
				padding: 8px 0;
				border-bottom: 1px solid #404040;
				margin-bottom: 8px;
				color: #569cd6;
				font-weight: bold;
			}
			.stats {
				font-size: 11px;
				color: #608b4e;
				margin-bottom: 8px;
			}
			.table-header {
				display: flex;
				padding: 4px 0;
				border-bottom: 1px solid #404040;
				margin-bottom: 4px;
				color: #569cd6;
				font-weight: bold;
				font-size: 11px;
				align-items: center;
			}
			.warning-line {
				display: flex;
				padding: 2px 0;
				cursor: pointer;
				border-radius: 2px;
				align-items: center;
			}
			.warning-line:hover {
				background-color: #2d2d30;
			}
			.rule-id {
				color: #f92672;
				font-weight: bold;
				width: 80px;
				flex-shrink: 0;
			}
			.message {
				color: #d4d4d4;
				flex: 1;
				margin: 0 8px;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}
			.location {
				color: #569cd6;
				width: 120px;
				text-align: right;
				flex-shrink: 0;
				font-size: 11px;
			}
			.file-name {
				color: #ce9178;
				font-size: 11px;
				width: 150px;
				text-align: right;
				flex-shrink: 0;
				margin-left: 8px;
			}
			.severity-required { border-left: 2px solid #f92672; padding-left: 4px; }
			.severity-advisory { border-left: 2px solid #fd971f; padding-left: 4px; }
			.severity-mandatory { border-left: 2px solid #a6e22e; padding-left: 4px; }
		</style>
	</head>
	<body>
		<div class="header">✗ SARIF Analysis: ${totalWarnings} issues found across ${fileCount} files</div>
		<div class="stats"># Click any warning below to view details and generate AI fixes</div>
		<div class="table-header">
			<span class="rule-id">RULE</span>
			<span class="message">DESCRIPTION</span>
			<span class="location">LINE:COL</span>
			<span class="file-name">FILE</span>
		</div>
		
		${results.map((result, index) => {
			const location = result.sarifResult.locations[0];
			const fileName = location?.uri ? location.uri.split('/').pop() || location.uri : 'unknown';
			const line = location?.startLine || '?';
			const col = location?.startColumn || '?';
			
			return `<div class="warning-line severity-${result.misraRule.severity.toLowerCase()}" onclick="showDetails(${index})" title="${result.misraRule.title}">
				<span class="rule-id">${result.sarifResult.ruleId}</span>
				<span class="message">${result.sarifResult.message}</span>
				<span class="location">${line}:${col}</span>
				<span class="file-name">${fileName}</span>
			</div>`;
		}).join('')}

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

function generateWebviewContentWithCode(results: any[], fixId?: number, fix?: any, _warningIndex?: number, violatedCode?: string): string {
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


// This method is called when your extension is deactivated
export function deactivate() {
	console.log('Deactivating SARIF AI Fixer extension');
	
	// Clean up all decorations
	clearGutterDecorations();
	
	// Clear global references
	globalProcessedResults = [];
	globalListPanel = undefined;
	globalDetailPanel = undefined;
}
